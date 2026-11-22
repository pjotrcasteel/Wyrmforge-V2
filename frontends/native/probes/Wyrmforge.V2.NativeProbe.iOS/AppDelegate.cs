using Foundation;
using ObjCRuntime;
using UIKit;
using Wyrmforge.V2.NativeProbe.Core;

namespace Wyrmforge.V2.NativeProbe.iOS;

/// <summary>Minimal native lifecycle bridge; validates C# portability before any scene/UI dependency.</summary>
[Register("AppDelegate")]
public sealed class AppDelegate : UIApplicationDelegate
{
    internal const string ReceiptName = "wyrmforge-n00-probe.txt";

    /// <inheritdoc />
    public override bool FinishedLaunching(UIApplication application, NSDictionary? launchOptions)
    {
        // Persist a native app sandbox receipt as early as UIKit's managed launch callback.
        // A scene/window lifecycle failure must not silently hide a successfully executed shared C# core.
        var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        Directory.CreateDirectory(documents);
        var receiptPath = Path.Combine(documents, ReceiptName);
        try
        {
            var proof = NativeSessionProof.Run();
            var receipt = $"status={proof.Status} tick={proof.Tick} accepted={proof.AcceptedCommands} " +
                          $"hash={proof.CanonicalHash} random={proof.RandomSample}";
            File.WriteAllText(receiptPath, receipt);
            Console.WriteLine($"WyrmforgeN00Probe {receipt}");
        }
        catch (Exception exception)
        {
            File.WriteAllText(receiptPath, $"status=FAIL type={exception.GetType().Name} message={exception.Message}");
            Console.Error.WriteLine($"WyrmforgeN00Probe FAIL {exception}");
            throw;
        }

        return true;
    }

    /// <inheritdoc />
    public override UISceneConfiguration GetConfiguration(
        UIApplication application,
        UISceneSession connectingSceneSession,
        UISceneConnectionOptions options)
    {
        return new UISceneConfiguration("Default Configuration", connectingSceneSession.Role);
    }
}
