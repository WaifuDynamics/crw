package expo.modules.crwalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** The moment an alarm comes due: start ringing, then line up the next one. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val key = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
    val id = AlarmScheduler.baseId(key)
    val wasSnooze = key != id

    val ring =
      Intent(context, AlarmService::class.java).apply {
        action = AlarmService.ACTION_RING
        putExtra(AlarmScheduler.EXTRA_ID, id)
      }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(ring)
    } else {
      context.startService(ring)
    }

    if (wasSnooze) return
    val alarm = AlarmStore.find(context, id) ?: return
    if (alarm.days.isEmpty()) {
      // A one-shot has now done its job.
      AlarmStore.disable(context, id)
    } else {
      // Repeating alarms are armed one occurrence at a time, so this is where next week
      // gets booked.
      AlarmScheduler.arm(context, alarm)
    }
  }
}
