package expo.modules.streakwidget

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Legătura dintre aplicație și widgetul cu streak-ul: aplicația trimite streak-ul, ziua ultimei confirmări și textele
 * în limba aleasă, iar widgetul se redesenează imediat.
 */
class StreakWidgetModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("StreakWidget")

    Function("update") { streak: Int, lastActiveOn: String?, days: String, zero: String, done: String, pending: String, start: String ->
      StreakWidget.save(context, streak, lastActiveOn, StreakWidget.Texts(days, zero, done, pending, start))
    }

    Function("clear") {
      StreakWidget.clear(context)
    }
  }
}
