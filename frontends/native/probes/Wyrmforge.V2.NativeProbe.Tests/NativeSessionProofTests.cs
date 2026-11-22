using Microsoft.VisualStudio.TestTools.UnitTesting;
using Wyrmforge.V2.NativeProbe.Core;

namespace Wyrmforge.V2.NativeProbe.Tests;

[TestClass]
public sealed class NativeSessionProofTests
{
    [TestMethod]
    public void SharedSimulationHasFixedCrossHostReplayVector()
    {
        var proof = NativeSessionProof.Run();
        Assert.AreEqual("PASS", proof.Status);
        Assert.AreEqual(2L, proof.Tick);
        Assert.AreEqual(1, proof.AcceptedCommands);
        Assert.AreEqual(NativeSessionProof.ExpectedHash, proof.CanonicalHash);
        Assert.AreEqual(NativeSessionProof.ExpectedRandomSample, proof.RandomSample);
    }

    [TestMethod]
    public void RepeatedExecutionsDoNotShareMutableSessionOrRandomState()
    {
        var one = NativeSessionProof.Run();
        var two = NativeSessionProof.Run();
        Assert.AreEqual(one, two);
    }
}
