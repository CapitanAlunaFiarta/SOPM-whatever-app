package expo.modules.streakwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Ce arată widgetul de pe ecranul principal: streak-ul și dacă azi ai confirmat ceva. Datele (și textele, în limba
 * aleasă în aplicație) le scrie aplicația; la fiecare reîmprospătare widgetul recalculează singur, fără internet, dacă
 * a început o zi nouă sau dacă streak-ul s-a rupt (ora României, ca pe server).
 */
internal object StreakWidget {
  private const val PREFS = "whatever_streak_widget"
  private val zone: TimeZone = TimeZone.getTimeZone("Europe/Bucharest")
  private val DONE_COLOR = 0xFF34D399.toInt()
  private val PENDING_COLOR = 0xFFFBBF24.toInt()
  private val START_COLOR = 0xFF22D3EE.toInt()

  /** Textele în limba aplicației: eticheta pentru streak-ul salvat, pentru 0 și cele trei stări ale zilei. */
  data class Texts(val days: String, val zero: String, val done: String, val pending: String, val start: String)

  fun save(context: Context, streak: Int, lastActiveOn: String?, texts: Texts) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("set", true)
      .putInt("streak", streak)
      .putString("lastActiveOn", lastActiveOn)
      .putString("days", texts.days)
      .putString("zero", texts.zero)
      .putString("done", texts.done)
      .putString("pending", texts.pending)
      .putString("start", texts.start)
      .apply()
    refreshAll(context)
  }

  /** La deconectare widgetul nu mai arată streak-ul nimănui. */
  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    refreshAll(context)
  }

  fun refreshAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val ids = manager.getAppWidgetIds(ComponentName(context, StreakWidgetProvider::class.java))
    for (id in ids) render(context, manager, id)
  }

  /** Ziua (YYYY-MM-DD) în ora României, cu un decalaj în zile. */
  private fun day(offset: Int): String {
    val calendar = Calendar.getInstance(zone)
    calendar.add(Calendar.DAY_OF_YEAR, offset)
    val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    format.timeZone = zone
    return format.format(calendar.time)
  }

  fun render(context: Context, manager: AppWidgetManager, id: Int) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val views = RemoteViews(context.packageName, R.layout.streak_widget)
    if (prefs.getBoolean("set", false)) {
      val last = prefs.getString("lastActiveOn", null)
      val today = day(0)
      val doneToday = last == today
      // Ca pe server: streak-ul trăiește dacă ultima confirmare a fost azi sau ieri.
      val alive = doneToday || last == day(-1)
      val streak = if (alive) prefs.getInt("streak", 0) else 0
      views.setTextViewText(R.id.streak_value, "🔥 $streak")
      views.setTextViewText(R.id.streak_label, prefs.getString(if (streak > 0) "days" else "zero", ""))
      when {
        doneToday -> {
          views.setTextViewText(R.id.streak_status, prefs.getString("done", ""))
          views.setTextColor(R.id.streak_status, DONE_COLOR)
        }
        streak > 0 -> {
          views.setTextViewText(R.id.streak_status, prefs.getString("pending", ""))
          views.setTextColor(R.id.streak_status, PENDING_COLOR)
        }
        else -> {
          views.setTextViewText(R.id.streak_status, prefs.getString("start", ""))
          views.setTextColor(R.id.streak_status, START_COLOR)
        }
      }
    }
    // Apăsarea pe widget deschide aplicația.
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launch != null) {
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      val pending = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      views.setOnClickPendingIntent(R.id.streak_widget_root, pending)
    }
    manager.updateAppWidget(id, views)
  }
}
