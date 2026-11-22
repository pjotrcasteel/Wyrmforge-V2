using CoreGraphics;
using ObjCRuntime;
using UIKit;
using Wyrmforge.V2.NativeProbe.Core;

namespace Wyrmforge.V2.NativeProbe.iOS;

/// <summary>Provides an ephemeral UIKit shell for the C# core parity and launch probe.</summary>
[Register("SceneDelegate")]
public sealed class SceneDelegate : UIWindowSceneDelegate
{
    /// <inheritdoc />
    public override UIWindow? Window { get; set; }

    /// <inheritdoc />
    public override void WillConnect(
        UIScene scene,
        UISceneSession session,
        UISceneConnectionOptions connectionOptions)
    {
        if (scene is not UIWindowScene windowScene)
        {
            throw new InvalidOperationException("The native iOS probe requires a window scene.");
        }

        var proof = NativeSessionProof.Run();
        var receipt = $"status={proof.Status} tick={proof.Tick} accepted={proof.AcceptedCommands} " +
                      $"hash={proof.CanonicalHash} random={proof.RandomSample}";

        // A simulator can verify the exact receipt from the native app sandbox without
        // relying on build logs, screenshot interpretation or an application-owned server.
        var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        File.WriteAllText(Path.Combine(documents, "wyrmforge-n00-probe.txt"), receipt);

        Window = new UIWindow(windowScene);
        var root = new UIViewController();
        root.View!.BackgroundColor = UIColor.FromRGB(20, 25, 29);
        var label = new UILabel(new CGRect(18, 90, 340, 240))
        {
            Text = "Wyrmforge V2 / N00 native C# proof\n" + receipt,
            Lines = 0,
            TextColor = UIColor.White,
        };
        root.View.AddSubview(label);
        Window.RootViewController = root;
        Window.MakeKeyAndVisible();
    }
}
