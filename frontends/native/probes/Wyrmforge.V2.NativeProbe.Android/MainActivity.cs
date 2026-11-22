using Android.App;
using Android.OS;
using Android.Util;
using Android.Widget;
using Wyrmforge.V2.NativeProbe.Core;

namespace Wyrmforge.V2.NativeProbe.Android;

/// <summary>Disposable Android OS-SDK probe. It is not a decision about the final native frontend.</summary>
[Activity(Label = "Wyrmforge N00 Probe", MainLauncher = true, Exported = true)]
public sealed class MainActivity : Activity
{
    /// <inheritdoc />
    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        var report = NativeSessionProof.Run();
        var receipt = $"status={report.Status} tick={report.Tick} accepted={report.AcceptedCommands} " +
                      $"hash={report.CanonicalHash} random={report.RandomSample}";
        Log.Info("WyrmforgeN00Probe", receipt);

        var view = new TextView(this)
        {
            Text = "Wyrmforge V2 / N00 native C# proof\n" + receipt,
            TextSize = 15,
        };

        SetContentView(view);
    }
}
