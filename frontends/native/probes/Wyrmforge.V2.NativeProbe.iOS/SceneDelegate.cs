using CoreGraphics;
using ObjCRuntime;
using UIKit;

namespace Wyrmforge.V2.NativeProbe.iOS;

/// <summary>Ephemeral native UIKit shell, never the authority for gameplay state.</summary>
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

        var path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            AppDelegate.ReceiptName);
        var receipt = File.Exists(path) ? File.ReadAllText(path) : "status=NO_RECEIPT";

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
