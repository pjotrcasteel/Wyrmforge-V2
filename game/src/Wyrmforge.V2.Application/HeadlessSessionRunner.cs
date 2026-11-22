using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Application;

/// <summary>
/// Test/host-neutral input scheduler. Only IHeadlessSession advances canonical time;
/// the snapshot receiver may be replaced with a fake, web or native presenter.
/// </summary>
public sealed class HeadlessSessionRunner
{
    private readonly IHeadlessSession session;
    private readonly ISessionSnapshotReceiver receiver;

    /// <summary>Creates a runner with replaceable simulation and presentation ports.</summary>
    public HeadlessSessionRunner(IHeadlessSession session, ISessionSnapshotReceiver receiver)
    {
        this.session = session ?? throw new ArgumentNullException(nameof(session));
        this.receiver = receiver ?? throw new ArgumentNullException(nameof(receiver));
    }

    /// <summary>
    /// Advances from the current tick to a target inclusive tick, delivering commands at
    /// their scheduled tick boundaries and publishing a read-only snapshot after each step.
    /// </summary>
    public void RunUntil(long targetTick, IReadOnlyList<ScheduledPlayerCommand> commands)
    {
        ArgumentNullException.ThrowIfNull(commands);
        if (targetTick < session.Tick)
        {
            throw new ArgumentOutOfRangeException(nameof(targetTick), "Cannot rewind simulation time.");
        }

        var previousDeliveryTick = session.Tick;
        foreach (var item in commands)
        {
            if (item.DeliveryTick <= session.Tick || item.DeliveryTick > targetTick)
            {
                throw new ArgumentOutOfRangeException(nameof(commands), "Command delivery tick is outside the requested future window.");
            }

            if (item.DeliveryTick < previousDeliveryTick)
            {
                throw new ArgumentException("Delivery ticks must be nondecreasing.", nameof(commands));
            }

            previousDeliveryTick = item.DeliveryTick;
        }

        var index = 0;
        while (session.Tick < targetTick)
        {
            var nextTick = checked(session.Tick + 1);
            while (index < commands.Count && commands[index].DeliveryTick == nextTick)
            {
                session.Submit(commands[index].Command);
                index++;
            }

            session.AdvanceTick();
            if (session.Tick != nextTick)
            {
                throw new InvalidOperationException("The session violated the fixed one-tick advance contract.");
            }

            receiver.Receive(session.Capture());
        }
    }
}
