package expo.modules.crwalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.VibrationAttributes
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * The ringing itself. A foreground service rather than a plain notification, because the
 * sound has to keep playing while the screen is off and while React Native is still
 * starting up.
 */
class AlarmService : Service() {
  companion object {
    const val ACTION_RING = "app.crwplus.fitness.RING"
    const val ACTION_STOP = "app.crwplus.fitness.STOP_RINGING"
    /** Sent while the app is already open, so it can show the ring screen at once. */
    const val ACTION_FIRED = "app.crwplus.fitness.ALARM_FIRED"

    const val CHANNEL = "alarm"
    private const val NOTIFICATION_ID = 424242

    /** Ringing for ever would flatten the battery; real clocks give up too. */
    private const val RING_TIMEOUT_MS = 15 * 60 * 1000L

    fun stop(context: Context) {
      // The service is in the foreground whenever there is something to stop, so this is
      // allowed; if it has already given up by itself, there is nothing to do either.
      runCatching {
        context.startService(
          Intent(context, AlarmService::class.java).apply { action = ACTION_STOP }
        )
      }
    }
  }

  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val giveUp = Handler(Looper.getMainLooper())

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopRinging()
      return START_NOT_STICKY
    }

    val id = intent?.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return START_NOT_STICKY
    AlarmStore.setFiring(this, id)

    startForeground(id)
    holdWakeLock()
    startSound()
    giveUp.postDelayed({ stopRinging() }, RING_TIMEOUT_MS)

    // If the app happens to be open, it can swap to the ring screen without waiting for
    // the user to tap anything.
    sendBroadcast(Intent(ACTION_FIRED).setPackage(packageName).putExtra(AlarmScheduler.EXTRA_ID, id))
    return START_STICKY
  }

  private fun startForeground(id: String) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel =
        NotificationChannel(CHANNEL, "Alarm", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Your morning challenge alarm."
          // The service plays the sound itself, on the alarm stream, so the channel stays
          // silent - otherwise the phone rings twice, out of step with itself.
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          setBypassDnd(true)
        }
      manager.createNotificationChannel(channel)
    }

    val launch =
      (packageManager.getLaunchIntentForPackage(packageName) ?: Intent(Intent.ACTION_MAIN)).apply {
        flags =
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(AlarmScheduler.EXTRA_ID, id)
      }
    val open =
      PendingIntent.getActivity(
        this,
        1,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    val notification =
      NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(smallIcon())
        .setContentTitle("Time to get up")
        .setContentText("Finish your reps to stop the alarm.")
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setContentIntent(open)
        // Where the lock-screen takeover comes from. Android 14 and up may refuse it, and
        // then this degrades by itself into an ordinary heads-up notification.
        .setFullScreenIntent(open, true)
        .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  /** The white "C+" mark the expo-notifications plugin puts in the build, if it is there. */
  private fun smallIcon(): Int {
    val id = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (id != 0) id else applicationInfo.icon
  }

  private fun holdWakeLock() {
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock =
      power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "crw:alarm").apply {
        setReferenceCounted(false)
        acquire(RING_TIMEOUT_MS)
      }
  }

  private fun startSound() {
    val tone =
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ?: return
    runCatching {
        player =
          MediaPlayer().apply {
            // USAGE_ALARM is what plays through silent mode and Do Not Disturb.
            setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            )
            setDataSource(this@AlarmService, tone)
            isLooping = true
            prepare()
            start()
          }
      }
      .onFailure { player = null }

    vibrate()
  }

  private fun vibrate() {
    val vibrator =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
    val effect = VibrationEffect.createWaveform(longArrayOf(0, 600, 600), 0)
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        // Marked as an alarm here too, so the vibration is allowed through Do Not Disturb
        // by the same rule as the sound.
        vibrator?.vibrate(
          effect,
          VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM),
        )
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(
          effect,
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build(),
        )
      }
    }
  }

  private fun stopRinging() {
    giveUp.removeCallbacksAndMessages(null)
    AlarmStore.setFiring(this, null)
    runCatching { player?.stop() }
    runCatching { player?.release() }
    player = null
    runCatching {
      val vibrator =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
          @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
      vibrator?.cancel()
    }
    runCatching { wakeLock?.release() }
    wakeLock = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    stopRinging()
    super.onDestroy()
  }
}
