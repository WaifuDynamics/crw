package expo.modules.crwalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * AlarmManager forgets every alarm when the phone restarts, when the app is replaced and
 * when the clock or the time zone moves. The app may not be opened for days after any of
 * those, so the alarms are armed again from native storage without waiting for JavaScript.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> AlarmScheduler.armAll(context)
    }
  }
}
