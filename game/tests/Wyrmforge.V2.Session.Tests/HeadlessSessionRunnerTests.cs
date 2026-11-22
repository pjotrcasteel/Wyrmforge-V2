using Microsoft.VisualStudio.TestTools.UnitTesting;
using Wyrmforge.V2.Application;
using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Session.Tests;

[TestClass]
public sealed class HeadlessSessionRunnerTests
{
    private static readonly Guid SessionId = Guid.Parse("470d6d1e-ea0a-41cc-95eb-61990b208078");

    [TestMethod]
    public void RunsRealSessionWithFakePresenterAndCanonicalReplay()
    {
        var session = new FixedStepSimulationSession(SessionId, seed: 11);
        var receiver = new CollectingReceiver();
        var runner = new HeadlessSessionRunner(session, receiver);
        runner.RunUntil(4,
        [
            new ScheduledPlayerCommand(2, Command(2, PlayerActionKind.Aim, 1, -2)),
            new ScheduledPlayerCommand(2, Command(1, PlayerActionKind.Move, 4, 5)),
            new ScheduledPlayerCommand(4, Command(3, PlayerActionKind.CastPrimary, -1, -7))
        ]);

        Assert.AreEqual(4L, session.Tick);
        Assert.AreEqual(4, receiver.Frames.Count);
        Assert.AreEqual(3, session.AcceptedCommandCount);
        CollectionAssert.AreEqual(new long[] { 2L, 2L, 4L },
            session.CaptureJournal().Select(e => e.Tick).ToArray());
        Assert.AreEqual(session.Capture().CanonicalStateHash, receiver.Frames[^1].CanonicalStateHash);

        var replay = FixedStepSimulationSession.Replay(SessionId, 11, session.CaptureJournal(), 4);
        Assert.AreEqual(session.Capture().CanonicalStateHash, replay.Capture().CanonicalStateHash);
    }

    [TestMethod]
    public void SwappingPresenterNeverChangesAuthoritativeStateHash()
    {
        var first = new FixedStepSimulationSession(SessionId, seed: 11);
        var second = new FixedStepSimulationSession(SessionId, seed: 11);
        var collect = new CollectingReceiver();
        new HeadlessSessionRunner(first, collect).RunUntil(2,
            [new ScheduledPlayerCommand(1, Command(1, PlayerActionKind.Move, 2))]);
        new HeadlessSessionRunner(second, new NoOpReceiver()).RunUntil(2,
            [new ScheduledPlayerCommand(1, Command(1, PlayerActionKind.Move, 2))]);
        Assert.AreEqual(first.Capture().CanonicalStateHash, second.Capture().CanonicalStateHash);
        Assert.AreEqual(2, collect.Frames.Count);
    }

    [TestMethod]
    public void FakeSessionCanReplaceRealSessionWithoutCodeChanges()
    {
        var fakeSession = new FakeSession();
        var receiver = new CollectingReceiver();
        new HeadlessSessionRunner(fakeSession, receiver).RunUntil(3,
        [
            new ScheduledPlayerCommand(1, Command(1, PlayerActionKind.Move)),
            new ScheduledPlayerCommand(3, Command(2, PlayerActionKind.Aim))
        ]);
        Assert.AreEqual(3L, fakeSession.Tick);
        Assert.AreEqual(2, fakeSession.Commands.Count);
        CollectionAssert.AreEqual(new long[] { 1L, 2L, 3L }, receiver.Frames.Select(x => x.Tick).ToArray());
    }

    [TestMethod]
    public void InvalidScheduleFailsBeforeAnyTickOrInputIsApplied()
    {
        var session = new FakeSession();
        var runner = new HeadlessSessionRunner(session, new NoOpReceiver());
        Assert.ThrowsExactly<ArgumentException>(() => runner.RunUntil(3,
        [
            new ScheduledPlayerCommand(2, Command(1, PlayerActionKind.Move)),
            new ScheduledPlayerCommand(1, Command(2, PlayerActionKind.Aim))
        ]));
        Assert.AreEqual(0L, session.Tick);
        Assert.AreEqual(0, session.Commands.Count);
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => runner.RunUntil(1,
            [new ScheduledPlayerCommand(2, Command(1, PlayerActionKind.Move))]));
        Assert.AreEqual(0L, session.Tick);
        Assert.AreEqual(0, session.Commands.Count);
    }

    [TestMethod]
    public void ContinuationToLaterTickDoesNotRewindOrReplayOldCommands()
    {
        var session = new FixedStepSimulationSession(SessionId, 5);
        var receiver = new CollectingReceiver();
        var runner = new HeadlessSessionRunner(session, receiver);
        runner.RunUntil(1, [new ScheduledPlayerCommand(1, Command(1, PlayerActionKind.Move))]);
        runner.RunUntil(3, []);
        Assert.AreEqual(3, receiver.Frames.Count);
        Assert.AreEqual(1, session.AcceptedCommandCount);
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => runner.RunUntil(2, []));
    }

    private static PlayerCommand Command(long sequence, PlayerActionKind action, int x = 0, int y = 0)
    {
        return new PlayerCommand(SessionId, sequence, action, x, y);
    }

    private sealed class CollectingReceiver : ISessionSnapshotReceiver
    {
        public List<SessionStateSnapshot> Frames { get; } = [];

        public void Receive(SessionStateSnapshot snapshot)
        {
            Frames.Add(snapshot);
        }
    }

    private sealed class NoOpReceiver : ISessionSnapshotReceiver
    {
        public void Receive(SessionStateSnapshot snapshot)
        {
        }
    }

    private sealed class FakeSession : IHeadlessSession
    {
        public long Tick { get; private set; }

        public List<PlayerCommand> Commands { get; } = [];

        public void Submit(PlayerCommand command)
        {
            Commands.Add(command);
        }

        public void AdvanceTick()
        {
            Tick++;
        }

        public SessionStateSnapshot Capture()
        {
            return new SessionStateSnapshot(SessionId, 0, Tick, Commands.Count, Commands.Count, 0, "FAKE");
        }

        public IReadOnlyList<AcceptedPlayerCommand> CaptureJournal()
        {
            return [];
        }
    }
}
