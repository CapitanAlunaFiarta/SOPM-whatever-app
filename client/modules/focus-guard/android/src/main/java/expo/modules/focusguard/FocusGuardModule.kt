package expo.modules.focusguard

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Sesiune de focus (ca în Forest), doar pe Android: nu blocăm nimic, ci verificăm la final, din istoricul
 * de utilizare al sistemului (UsageStatsManager), dacă vreuna dintre aplicațiile alese a fost deschisă
 * între începutul sesiunii și acum. Istoricul cere permisiunea „Acces la datele de utilizare”, pe care
 * utilizatorul o dă din Setări (nu printr-un dialog obișnuit).
 */
class FocusGuardModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FocusGuard")

    /** Utilizatorul a dat aplicației acces la datele de utilizare? */
    Function("hasUsageAccess") {
      val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      }
      mode == AppOpsManager.MODE_ALLOWED
    }

    /** Deschide ecranul din Setări unde se dă accesul la datele de utilizare. */
    Function("openUsageAccessSettings") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    /** Aplicațiile instalate care apar în lista de aplicații (au o activitate de pornire), fără Whatever. */
    AsyncFunction("getLaunchableApps") {
      val packageManager = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val activities: List<ResolveInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packageManager.queryIntentActivities(launcher, PackageManager.ResolveInfoFlags.of(0L))
      } else {
        @Suppress("DEPRECATION")
        packageManager.queryIntentActivities(launcher, 0)
      }
      activities
        .map { info -> info.activityInfo.packageName to info.loadLabel(packageManager).toString() }
        .filter { (packageName, _) -> packageName != context.packageName }
        .distinctBy { (packageName, _) -> packageName }
        .sortedBy { (_, label) -> label.lowercase() }
        .map { (packageName, label) -> mapOf("packageName" to packageName, "label" to label) }
    }

    /**
     * Când au fost aduse în prim-plan aplicațiile din `packages`, începând cu `since` (milisecunde).
     * Întoarce [{ packageName, timestamp }]; o listă goală înseamnă că sesiunea a reușit.
     */
    AsyncFunction("getOpenedApps") { since: Double, packages: List<String> ->
      val usageStats = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val events = usageStats.queryEvents(since.toLong(), System.currentTimeMillis())
      val event = UsageEvents.Event()
      val watched = packages.toSet()
      val opened = mutableListOf<Map<String, Any>>()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        // MOVE_TO_FOREGROUND (1) e același eveniment cu ACTIVITY_RESUMED din Android 10.
        @Suppress("DEPRECATION")
        val foreground = event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
        if (foreground && event.packageName in watched) {
          opened.add(mapOf("packageName" to event.packageName, "timestamp" to event.timeStamp.toDouble()))
        }
      }
      opened
    }
  }
}
