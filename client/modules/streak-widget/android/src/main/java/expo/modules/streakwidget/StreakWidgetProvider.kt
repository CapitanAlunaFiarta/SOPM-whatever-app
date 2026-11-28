package expo.modules.streakwidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

/** Sistemul cere desenarea widgetului (la adăugare și periodic, cel mult o dată la 30 de minute). */
class StreakWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) StreakWidget.render(context, appWidgetManager, id)
  }
}
