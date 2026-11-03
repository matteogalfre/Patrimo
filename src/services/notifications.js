/**
 * Service de notifications locales (expo-notifications).
 *
 * Notifications locales uniquement, jamais de push : alertes de prix
 * immédiates, et rappels mensuels (investissements programmés, mise à jour
 * des livrets). Toute la logique de permission est isolée ici pour que les
 * contextes restent déclaratifs.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Affiche les notifications même app au premier plan (sinon iOS les masque).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permissionGranted = null;

/**
 * Demande (une seule fois) la permission d'afficher des notifications.
 * Mémoïse le résultat pour éviter de reprompter à chaque déclenchement.
 * @returns {Promise<boolean>}
 */
export const ensureNotificationPermission = async () => {
  if (permissionGranted !== null) return permissionGranted;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    permissionGranted = status === 'granted';

    if (permissionGranted && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('price-alerts', {
        name: 'Price alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    return permissionGranted;
  } catch {
    permissionGranted = false;
    return false;
  }
};

/**
 * Présente immédiatement une notification locale.
 * @param {{ title: string, body: string }} content
 */
export const presentLocalNotification = async ({ title, body }) => {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        ...(Platform.OS === 'android' ? { channelId: 'price-alerts' } : {}),
      },
      trigger: null, // immédiat
    });
  } catch {
    // Best effort — l'alerte reste marquée déclenchée côté état même si la
    // notification système échoue.
  }
};

const REMINDER_PREFIX = 'patrimo-reminder-';

/**
 * Remplace tous les rappels mensuels de l'app par ceux demandés.
 * @param {Array<{id: string, day: number, title: string, body: string}>} reminders
 */
export const syncMonthlyReminders = async (reminders) => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => String(n.identifier).startsWith(REMINDER_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    if (!reminders.length || !(await ensureNotificationPermission())) return;
    await Promise.all(reminders.map((r) => Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_PREFIX}${r.id}`,
      content: { title: r.title, body: r.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day: r.day,
        hour: 9,
        minute: 0,
        ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
      },
    })));
  } catch {
    // Rappels facultatifs : un échec ne doit rien bloquer.
  }
};
