package expo.modules.patrimonotify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Notifications locales de Patrimo, sans Firebase ni services Google :
 * alertes immédiates, et rappels mensuels programmés avec AlarmManager
 * (reprogrammés à chaque déclenchement et après un redémarrage).
 */
class PatrimoNotifyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PatrimoNotify")

    Function("areEnabled") {
      val context = appContext.reactContext ?: return@Function false
      NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    Function("present") { title: String, body: String, channel: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Contexte Android indisponible")
      Notify.post(context, channel, (title + body).hashCode(), title, body)
      true
    }

    // Remplace tous les rappels mensuels : [{ id, day, hour, minute, title, body }]
    Function("setMonthlyReminders") { json: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Contexte Android indisponible")
      Reminders.replace(context, JSONArray(json))
      true
    }
  }
}

internal object Notify {
  const val ALERTS = "price-alerts"
  const val REMINDERS = "reminders"

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(ALERTS) == null) {
      nm.createNotificationChannel(NotificationChannel(ALERTS, "Price alerts", NotificationManager.IMPORTANCE_HIGH))
    }
    if (nm.getNotificationChannel(REMINDERS) == null) {
      nm.createNotificationChannel(NotificationChannel(REMINDERS, "Reminders", NotificationManager.IMPORTANCE_DEFAULT))
    }
  }

  fun post(context: Context, channel: String, id: Int, title: String, body: String) {
    ensureChannels(context)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val open = launch?.let {
      PendingIntent.getActivity(context, id, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val icon = context.resources.getIdentifier("patrimo_notification", "drawable", context.packageName)
    val notification = NotificationCompat.Builder(context, if (channel == REMINDERS) REMINDERS else ALERTS)
      .setSmallIcon(if (icon != 0) icon else context.applicationInfo.icon)
      .setColor(0xFFB5560F.toInt())
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .apply { if (open != null) setContentIntent(open) }
      .build()
    try {
      NotificationManagerCompat.from(context).notify(id, notification)
    } catch (_: SecurityException) {
      // Permission refusée : rien à afficher.
    }
  }
}

internal object Reminders {
  private const val PREFS = "patrimo_reminders"
  private const val KEY = "list"

  fun replace(context: Context, list: JSONArray) {
    stored(context).forEach { cancel(context, it) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, list.toString()).apply()
    stored(context).forEach { schedule(context, it) }
  }

  fun stored(context: Context): List<JSONObject> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]"
    val array = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
  }

  fun find(context: Context, id: String): JSONObject? = stored(context).firstOrNull { it.optString("id") == id }

  /** Prochain « jour J du mois à HH:MM », ramené au dernier jour pour les mois trop courts. */
  fun nextTime(day: Int, hour: Int, minute: Int, now: Calendar = Calendar.getInstance()): Long {
    val c = now.clone() as Calendar
    for (i in 0..12) {
      c.timeInMillis = now.timeInMillis
      c.set(Calendar.DAY_OF_MONTH, 1)
      c.add(Calendar.MONTH, i)
      c.set(Calendar.DAY_OF_MONTH, minOf(day.coerceAtLeast(1), c.getActualMaximum(Calendar.DAY_OF_MONTH)))
      c.set(Calendar.HOUR_OF_DAY, hour)
      c.set(Calendar.MINUTE, minute)
      c.set(Calendar.SECOND, 0)
      c.set(Calendar.MILLISECOND, 0)
      if (c.timeInMillis > now.timeInMillis) return c.timeInMillis
    }
    return now.timeInMillis + 30L * 24 * 3600 * 1000
  }

  private fun pending(context: Context, id: String): PendingIntent {
    val intent = Intent(context, ReminderReceiver::class.java).putExtra("id", id)
    return PendingIntent.getBroadcast(context, id.hashCode(), intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun schedule(context: Context, r: JSONObject) {
    val id = r.optString("id").ifEmpty { return }
    val at = nextTime(r.optInt("day", 1), r.optInt("hour", 9), r.optInt("minute", 0))
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    // Alarme inexacte : pas de permission spéciale, et Android peut la décaler de quelques minutes.
    if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, id))
    else am.set(AlarmManager.RTC_WAKEUP, at, pending(context, id))
  }

  private fun cancel(context: Context, r: JSONObject) {
    val id = r.optString("id").ifEmpty { return }
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pending(context, id))
  }
}

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    val r = Reminders.find(context, id) ?: return
    Notify.post(context, Notify.REMINDERS, id.hashCode(), r.optString("title"), r.optString("body"))
    Reminders.schedule(context, r)
  }
}

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Reminders.stored(context).forEach { Reminders.schedule(context, it) }
  }
}
