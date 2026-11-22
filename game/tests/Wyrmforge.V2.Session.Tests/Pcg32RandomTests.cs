using Microsoft.VisualStudio.TestTools.UnitTesting;
using Wyrmforge.V2.Application;
using Wyrmforge.V2.Contracts;

namespace Wyrmforge.V2.Session.Tests;

[TestClass]
public sealed class Pcg32RandomTests
{
    [TestMethod]
    public void ReferenceSequenceForSeedSevenAndStreamZeroIsStable()
    {
        IDeterministicRandomStream random = new Pcg32Random(seed: 7, stream: 0);
        var expected = new uint[]
        {
            4063834449U,
            2143014202U,
            2740157135U,
            3385478207U,
            3546536764U,
            785995372U
        };
        var samples = Enumerable.Range(0, expected.Length).Select(_ => random.NextUInt32()).ToArray();
        CollectionAssert.AreEqual(expected, samples);
    }

    [TestMethod]
    public void EqualSeedAndStreamProduceIdenticalIndependentSequences()
    {
        IDeterministicRandomStream first = new Pcg32Random(seed: -13, stream: 84);
        IDeterministicRandomStream second = new Pcg32Random(seed: -13, stream: 84);
        for (var i = 0; i < 32; i++)
        {
            Assert.AreEqual(first.NextUInt32(), second.NextUInt32());
        }
    }

    [TestMethod]
    public void EngineStreamsDoNotShareStateOrSamples()
    {
        var first = new Pcg32Random(seed: 7, stream: 0);
        var second = new Pcg32Random(seed: 7, stream: 1);
        var firstSamples = Enumerable.Range(0, 8).Select(_ => first.NextUInt32()).ToArray();
        var secondSamples = Enumerable.Range(0, 8).Select(_ => second.NextUInt32()).ToArray();
        CollectionAssert.AreNotEqual(firstSamples, secondSamples);
        Assert.AreEqual(4063834449U, new Pcg32Random(7, stream: 0).NextUInt32());
    }
}
