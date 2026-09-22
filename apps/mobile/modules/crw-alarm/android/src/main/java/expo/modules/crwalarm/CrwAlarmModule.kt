package expo.modules.crwalarm

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

// The JavaScript side of the alarm clock. Everything the user sees is React Native; this
// module only owns the things JavaScript cannot do: ring at an exact time, play through
// silent mode, and come up over the lock screen.

class CrwAlarmModule : Module() {
  private var fired: BroadcastReceiver? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No Android context" }

  override fun definition() = ModuleDefinition {
    Name("CrwAlarm")

    Events("onAlarmFire")

    OnCreate {
      val receiver =
        object : BroadcastReceiver() {
          override fun onReceive(ctx: Context, intent: Intent) {
            val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
            // Qualified: inside this receiver, a bare sendEvent would not be the module's.
            this@CrwAlarmModule.sendEvent("onAlarmFire", mapOf("id" to id))
          }
        }
      val filter = IntentFilter(AlarmService.ACTION_FIRED)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag") context.registerReceiver(receiver, filter)
      }
      fired = receiver
    }

    OnDestroy {
      fired?.let { runCatching { context.unregisterReceiver(it) } }
      fired = null
    }

    /**
     * Replaces the whole alarm list and arms it. The app always sends the complete list,
     * so the native copy can never drift out of step with what the user sees.
     */
    AsyncFunction("schedule") { json: String ->
      val list = JSONArray(json)
      val alarms =
        (0 until list.length()).mapNotNull { i ->
          list.optJSONObject(i)?.let { StoredAlarm.fromJson(it) }
        }
          .filter { it.id.isNotEmpty() }
      AlarmStore.replaceAll(context, alarms)
      AlarmScheduler.armAll(context)
      alarms.size
    }

    AsyncFunction("cancel") { id: String ->
      AlarmScheduler.cancel(context, id)
      AlarmStore.replaceAll(context, AlarmStore.all(context).filter { it.id != id })
    }

    /** The moment the next alarm rings, or null when none is armed. */
    AsyncFunction("nextTrigger") {
      val now = System.currentTimeMillis()
      AlarmStore.all(context).mapNotNull { AlarmScheduler.nextTrigger(it, now) }.minOrNull()
    }

    AsyncFunction("snooze") { minutes: Int ->
      val id = AlarmStore.firing(context)
      AlarmService.stop(context)
      if (id != null) AlarmScheduler.snooze(context, id, minutes) else null
    }

    AsyncFunction("stopRinging") {
      AlarmService.stop(context)
      AlarmStore.setSnoozeOf(context, null)
    }

    /** Which alarm is ringing, read by the app on a cold start. */
    AsyncFunction("firingAlarmId") { AlarmStore.firing(context) }

    AsyncFunction("permissions") {
      val notifications = NotificationManagerCompat.from(context).areNotificationsEnabled()
      val fullScreen =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .canUseFullScreenIntent()
        } else {
          true
        }
      mapOf(
        "exactAlarm" to AlarmScheduler.canScheduleExact(context),
        "fullScreenIntent" to fullScreen,
        "notifications" to notifications,
      )
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        open(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, appUri()))
      }
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        open(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, appUri()))
      }
    }

    /**
     * The battery list rather than a direct request: asking to be exempted outright needs
     * a permission Google Play polices, and the list gets the user to the same switch.
     */
    Function("openBatterySettings") {
      open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    /**
     * Lets the activity appear over the lock screen and light the display. Turned on while
     * the ring screen is up and off again afterwards, so the rest of the app behaves
     * normally.
     */
    Function("showWhenLocked") { enabled: Boolean ->
      val activity = appContext.activityProvider?.currentActivity ?: return@Function
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(enabled)
          activity.setTurnScreenOn(enabled)
        } else {
          @Suppress("DEPRECATION")
          val flags =
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
              WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          if (enabled) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
        }
        if (enabled) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
    }
  }

  private fun appUri(): Uri = Uri.parse("package:${context.packageName}")

  private fun open(intent: Intent) {
    val activity = appContext.activityProvider?.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
