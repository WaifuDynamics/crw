package expo.modules.crwalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

// The alarm list and the arithmetic that turns it into the next moment the phone should
// ring. Both live on the native side on purpose: after a restart JavaScript does not run
// until somebody opens the app, so an alarm that only existed in AsyncStorage would
// quietly stop going off.

/** Days are ISO: Monday is 1, Sunday is 7. An empty set means a one-shot alarm. */
data class StoredAlarm(
  val id: String,
  val hour: Int,
  val minute: Int,
  val days: Set<Int>,
  val enabled: Boolean,
) {
  fun toJson(): JSONObject =
    JSONObject().apply {
      put("id", id)
      put("hour", hour)
      put("minute", minute)
      put("days", JSONArray().apply { days.sorted().forEach { put(it) } })
      put("enabled", enabled)
    }

  companion object {
    fun fromJson(o: JSONObject): StoredAlarm {
      val days = mutableSetOf<Int>()
      val list = o.optJSONArray("days")
      if (list != null) for (i in 0 until list.length()) days.add(list.optInt(i))
      return StoredAlarm(
        id = o.optString("id"),
        hour = o.optInt("hour").coerceIn(0, 23),
        minute = o.optInt("minute").coerceIn(0, 59),
        days = days.filter { it in 1..7 }.toSet(),
        enabled = o.optBoolean("enabled", true),
      )
    }
  }
}

object AlarmStore {
  private const val PREFS = "crw.alarm"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_FIRING = "firing"
  private const val KEY_SNOOZE = "snoozeOf"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun all(context: Context): List<StoredAlarm> {
    val raw = prefs(context).getString(KEY_ALARMS, null) ?: return emptyList()
    return runCatching {
      val list = JSONArray(raw)
      (0 until list.length()).mapNotNull { i ->
        list.optJSONObject(i)?.let { StoredAlarm.fromJson(it) }
      }
    }
      .getOrDefault(emptyList())
      .filter { it.id.isNotEmpty() }
  }

  fun replaceAll(context: Context, alarms: List<StoredAlarm>) {
    val list = JSONArray().apply { alarms.forEach { put(it.toJson()) } }
    prefs(context).edit().putString(KEY_ALARMS, list.toString()).apply()
  }

  fun find(context: Context, id: String): StoredAlarm? = all(context).firstOrNull { it.id == id }

  /** Turns a one-shot alarm off once it has rung, so it does not come back tomorrow. */
  fun disable(context: Context, id: String) {
    replaceAll(context, all(context).map { if (it.id == id) it.copy(enabled = false) else it })
  }

  /** The alarm that is ringing right now, which the app reads on a cold start. */
  fun firing(context: Context): String? = prefs(context).getString(KEY_FIRING, null)

  fun setFiring(context: Context, id: String?) {
    prefs(context).edit().apply {
      if (id == null) remove(KEY_FIRING) else putString(KEY_FIRING, id)
    }.apply()
  }

  /** Which alarm a pending snooze belongs to, so the ring screen knows what it owes. */
  fun snoozeOf(context: Context): String? = prefs(context).getString(KEY_SNOOZE, null)

  fun setSnoozeOf(context: Context, id: String?) {
    prefs(context).edit().apply {
      if (id == null) remove(KEY_SNOOZE) else putString(KEY_SNOOZE, id)
    }.apply()
  }
}

object AlarmScheduler {
  const val EXTRA_ID = "crwAlarmId"
  private const val SNOOZE_SUFFIX = "#snooze"

  /**
   * The next moment this alarm should ring after [from], or null when it never will.
   * Walks day by day rather than doing the arithmetic in milliseconds, so the hour stays
   * 7:00 across a daylight-saving change instead of drifting to 6:00 or 8:00.
   */
  fun nextTrigger(alarm: StoredAlarm, from: Long): Long? {
    if (!alarm.enabled) return null
    val base = Calendar.getInstance().apply { timeInMillis = from }
    for (add in 0..7) {
      val c =
        (base.clone() as Calendar).apply {
          add(Calendar.DAY_OF_YEAR, add)
          set(Calendar.HOUR_OF_DAY, alarm.hour)
          set(Calendar.MINUTE, alarm.minute)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
        }
      if (c.timeInMillis <= from) continue
      if (alarm.days.isEmpty()) return c.timeInMillis
      if (alarm.days.contains(isoDayOfWeek(c))) return c.timeInMillis
    }
    return null
  }

  private fun isoDayOfWeek(c: Calendar): Int {
    val day = c.get(Calendar.DAY_OF_WEEK)
    return if (day == Calendar.SUNDAY) 7 else day - 1
  }

  private fun requestCode(id: String) = id.hashCode()

  private fun pendingIntent(context: Context, id: String): PendingIntent {
    val intent =
      Intent(context, AlarmReceiver::class.java).apply {
        // Without a distinct data uri Android treats two alarms as the same intent and
        // the second one overwrites the first.
        action = "app.crwplus.fitness.ALARM"
        putExtra(EXTRA_ID, id)
        data = android.net.Uri.parse("crwalarm://$id")
      }
    return PendingIntent.getBroadcast(
      context,
      requestCode(id),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun alarmManager(context: Context) =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun canScheduleExact(context: Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      alarmManager(context).canScheduleExactAlarms()
    } else {
      true
    }

  /** Arms one alarm. Returns the moment it will ring, or null when it will not. */
  fun arm(context: Context, alarm: StoredAlarm, from: Long = System.currentTimeMillis()): Long? {
    val trigger = nextTrigger(alarm, from) ?: return null
    set(context, alarm.id, trigger)
    return trigger
  }

  fun snooze(context: Context, id: String, minutes: Int): Long {
    val trigger = System.currentTimeMillis() + minutes.coerceIn(1, 60) * 60_000L
    AlarmStore.setSnoozeOf(context, id)
    set(context, id + SNOOZE_SUFFIX, trigger)
    return trigger
  }

  private fun set(context: Context, key: String, trigger: Long) {
    val manager = alarmManager(context)
    val fire = pendingIntent(context, key)
    if (canScheduleExact(context)) {
      // setAlarmClock is the one kind of alarm Doze never delays, and it puts the alarm
      // icon in the status bar the way a clock app does.
      manager.setAlarmClock(AlarmManager.AlarmClockInfo(trigger, showApp(context)), fire)
    } else {
      // Missing the exact-alarm permission costs precision, not the alarm itself.
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, fire)
    }
  }

  private fun showApp(context: Context): PendingIntent {
    val launch =
      context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(Intent.ACTION_MAIN)
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun cancel(context: Context, id: String) {
    val manager = alarmManager(context)
    manager.cancel(pendingIntent(context, id))
    manager.cancel(pendingIntent(context, id + SNOOZE_SUFFIX))
  }

  /** Re-arms every stored alarm. Used after a change from JavaScript and after a reboot. */
  fun armAll(context: Context) {
    for (alarm in AlarmStore.all(context)) {
      cancel(context, alarm.id)
      if (alarm.enabled) arm(context, alarm)
    }
  }

  /** The id an alarm intent refers to, with the snooze marker taken off. */
  fun baseId(key: String) = key.removeSuffix(SNOOZE_SUFFIX)
}
