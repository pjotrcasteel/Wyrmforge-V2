using ObjCRuntime;
using UIKit;

namespace Wyrmforge.V2.NativeProbe.iOS;

/// <summary>Minimal native scene lifecycle bridge; this is not a future renderer choice.</summary>
[Register("AppDelegate")]
public sealed class AppDelegate : UIApplicationDelegate
{
    /// <inheritdoc />
    public override UISceneConfiguration GetConfiguration(
        UIApplication application,
        UISceneSession connectingSceneSession,
        UISceneConnectionOptions options)
    {
        return new UISceneConfiguration("Default Configuration", connectingSceneSession.Role);
    }
}
