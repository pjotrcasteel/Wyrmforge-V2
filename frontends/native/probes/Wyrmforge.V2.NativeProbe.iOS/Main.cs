using UIKit;

namespace Wyrmforge.V2.NativeProbe.iOS;

/// <summary>Disposable UIKit startup used only to prove native C# runtime feasibility.</summary>
public static class MainClass
{
    /// <summary>Starts the platform's actual native UIKit application loop.</summary>
    public static void Main(string[] args)
    {
        UIApplication.Main(args, null, typeof(AppDelegate));
    }
}
