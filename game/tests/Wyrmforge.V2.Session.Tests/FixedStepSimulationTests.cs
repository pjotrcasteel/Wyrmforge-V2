using Microsoft.VisualStudio.TestTools.UnitTesting;
using Wyrmforge.V2.Application;
using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Session.Tests;

[TestClass]
public sealed class FixedStepSimulationTests
{
    private static readonly Guid SessionId = Guid.Parse("b7b4d852-4cba-4175-a8b9-503c7268249e");

    [TestMethod]
    public void SameSeedAndTickBoundaryCommandsProduceIdenticalJournalAndHash()
    {
        var first = new FixedStepSimulationSession(SessionId, seed: 7);
        var second = new FixedStepSimulationSession(SessionId, seed: 7);
        var one = Command(1, PlayerActionKind.Move, 3, -4);
        var two = Command(2, PlayerActionKind.Aim, -5, 2);

        first.Submit(two);
        first.Submit(one);
        second.Submit(one);
        second.Submit(two);
        first.AdvanceTick();
        second.AdvanceTick();

        CollectionAssert.AreEqual(first.CaptureJournal().ToArray(), second.CaptureJournal().ToArray());
        Assert.AreEqual(first.Capture().CanonicalStateHash, second.Capture().CanonicalStateHash);
        Assert.AreEqual(2, first.Capture().AcceptedCommandCount);
        Assert.AreEqual(0, first.Capture().PendingCommandCount);
        Assert.AreEqual(1L, first.Tick);
    }

    [TestMethod]
    public void MissingSequenceWaitsForGapAndCommitsInOrder()
    {
        var session = new FixedStepSimulationSession(SessionId, seed: 7);
        session.Submit(Command(2, PlayerActionKind.Aim));
        session.AdvanceTick();
        Assert.AreEqual(1L, session.Tick);
        Assert.AreEqual(0, session.AcceptedCommandCount);
        Assert.AreEqual(1, session.PendingCommandCount);
        session.Submit(Command(1, PlayerActionKind.Move));
        session.AdvanceTick();
        CollectionAssert.AreEqual(new long[] { 1L, 2L },
            session.CaptureJournal().Select(item => item.Command.Sequence).ToArray());
        Assert.IsTrue(session.CaptureJournal().All(item => item.Tick == 2));
    }

    [TestMethod]
    public void DuplicateCommandsAreIdempotentButSequenceMutationIsRejected()
    {
        var session = new FixedStepSimulationSession(SessionId, seed: 7);
        var original = Command(1, PlayerActionKind.Move);
        session.Submit(original);
        session.Submit(original);
        Assert.AreEqual(1, session.PendingCommandCount);
        Assert.ThrowsExactly<InvalidOperationException>(() => session.Submit(Command(1, PlayerActionKind.Aim)));
        session.AdvanceTick();
        var hashBefore = session.Capture().CanonicalStateHash;
        session.Submit(original);
        Assert.AreEqual(hashBefore, session.Capture().CanonicalStateHash);
        Assert.AreEqual(1, session.AcceptedCommandCount);
        Assert.ThrowsExactly<InvalidOperationException>(() => session.Submit(Command(1, PlayerActionKind.Aim)));
    }

    [TestMethod]
    public void ForeignInvalidAndOutOfWindowCommandsAreRejected()
    {
        var session = new FixedStepSimulationSession(SessionId, seed: 7, maxPendingCommands: 2);
        Assert.ThrowsExactly<ArgumentException>(() =>
            session.Submit(new PlayerCommand(Guid.NewGuid(), 1, PlayerActionKind.Move)));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => session.Submit(Command(0, PlayerActionKind.Move)));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => session.Submit(Command(1, (PlayerActionKind)999)));
        Assert.ThrowsExactly<InvalidOperationException>(() => session.Submit(Command(3, PlayerActionKind.Move)));
        Assert.AreEqual(0, session.PendingCommandCount);
    }

    [TestMethod]
    public void SessionBoundsJournalAndQueueRatherThanGrowingWithoutLimit()
    {
        var session = new FixedStepSimulationSession(SessionId, seed: 7, maxPendingCommands: 2, maxAcceptedCommands: 2);
        session.Submit(Command(2, PlayerActionKind.Aim));
        session.Submit(Command(1, PlayerActionKind.Move));
        Assert.ThrowsExactly<InvalidOperationException>(() => session.Submit(Command(2, PlayerActionKind.CastPrimary, 1)));
        session.AdvanceTick();
        Assert.AreEqual(2, session.AcceptedCommandCount);
        Assert.ThrowsExactly<InvalidOperationException>(() => session.Submit(Command(3, PlayerActionKind.Move)));
    }

    [TestMethod]
    public void CapturedJournalReplaysToExactDigestWithoutPresenterOrPhysics()
    {
        var session = new FixedStepSimulationSession(SessionId, seed: 41);
        IPlayerCommandSink input = session;
        ISimulationSession clock = session;
        clock.AdvanceTick();
        input.Submit(Command(2, PlayerActionKind.CastPrimary, 9, -9));
        input.Submit(Command(1, PlayerActionKind.Move, -100, 100));
        clock.AdvanceTick();
        clock.AdvanceTick();
        input.Submit(Command(3, PlayerActionKind.SelectHuntRoute, 1));
        clock.AdvanceTick();

        var journal = session.CaptureJournal();
        var replay = FixedStepSimulationSession.Replay(SessionId, 41, journal, clock.Tick);
        CollectionAssert.AreEqual(journal.ToArray(), replay.CaptureJournal().ToArray());
        Assert.AreEqual(session.Capture().CanonicalStateHash, replay.Capture().CanonicalStateHash);
        Assert.AreEqual(clock.Tick, replay.Tick);
    }

    [TestMethod]
    public void HashIncludesEveryTickSessionAndSeed()
    {
        var first = new FixedStepSimulationSession(SessionId, seed: 5);
        var second = new FixedStepSimulationSession(SessionId, seed: 5);
        Assert.AreEqual(first.Capture().CanonicalStateHash, second.Capture().CanonicalStateHash);
        second.AdvanceTick();
        Assert.AreNotEqual(first.Capture().CanonicalStateHash, second.Capture().CanonicalStateHash);
        Assert.AreNotEqual(first.Capture().CanonicalStateHash,
            new FixedStepSimulationSession(SessionId, seed: 6).Capture().CanonicalStateHash);
        Assert.AreNotEqual(first.Capture().CanonicalStateHash,
            new FixedStepSimulationSession(Guid.NewGuid(), seed: 5).Capture().CanonicalStateHash);
    }

    [TestMethod]
    public void ReplayRejectsOutOfOrderOrInvalidTickHistory()
    {
        var invalid = new[]
        {
            new AcceptedPlayerCommand(2, Command(2, PlayerActionKind.Move)),
            new AcceptedPlayerCommand(1, Command(1, PlayerActionKind.Move))
        };
        Assert.ThrowsExactly<ArgumentException>(() => FixedStepSimulationSession.Replay(SessionId, 5, invalid, 2));
        Assert.ThrowsExactly<ArgumentException>(() =>
            FixedStepSimulationSession.Replay(SessionId, 5, [new AcceptedPlayerCommand(3, Command(1, PlayerActionKind.Move))], 2));
    }

    private static PlayerCommand Command(long sequence, PlayerActionKind action, int x = 0, int y = 0)
    {
        return new PlayerCommand(SessionId, sequence, action, x, y);
    }
}
