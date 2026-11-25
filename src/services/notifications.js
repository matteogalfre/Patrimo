/**
 * Service de notifications locales.
 *
 * Notifications locales uniquement, jamais de push : alertes de prix
 * immédiates, et rappels mensuels (investissements programmés, mise à jour
 * des livrets). Toute la logique de permission est isolée ici pour que les
 * contextes restent déclaratifs.
 *
 * Android passe par le module maison `patrimo-notify` : aucune dépendance à
 * Firebase ni aux services Google (expo-notifications en embarque, même pour
 * de simples notifications locales). iOS garde expo-notifications.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import PatrimoNotify from '../../modules/patrimo-notify';

const IOS = Platform.OS === 'ios';
const ANDROID = Platform.OS === 'android';
const REMINDER_PREFIX = 'patrimo-reminder-';

let expoNotifications = null;
const ios = () => {
  if (!expoNotifications) {
    expoNotifications = require('expo-notifications');
    // Affiche les notifications même app au premier plan (sinon iOS les masque).
    expoNotifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return expoNotifications;
};

let permissionGranted = false;
let permissionRequest = null;

const askPermission = async () => {
  if (ANDROID) {
    if (!PatrimoNotify) return false;
    // Android 13+ demande la permission ; avant, elle est accordée d'office.
    if (Platform.Version >= 33) {
      const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (await PermissionsAndroid.check(perm)) return true;
      return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
    }
    return PatrimoNotify.areEnabled();
  }
  if (!IOS) return false;
  const Notifications = ios();
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  return (await Notifications.requestPermissionsAsync()).status === 'granted';
};

/**
 * Demande la permission d'afficher des notifications. Les appels simultanés
 * (création d'une alerte déjà atteinte, par exemple) partagent la même
 * demande : une seconde fenêtre Android répondrait « refusé ». Un refus n'est
 * pas retenu, pour qu'une autorisation donnée plus tard soit prise en compte.
 * @returns {Promise<boolean>}
 */
export const ensureNotificationPermission = async () => {
  if (permissionGranted) return true;
  if (!permissionRequest) {
    permissionRequest = askPermission()
      .catch(() => false)
      .finally(() => { permissionRequest = null; });
  }
  permissionGranted = await permissionRequest;
  return permissionGranted;
};

/**
 * Présente immédiatement une notification locale.
 * @param {{ title: string, body: string }} content
 */
export const presentLocalNotification = async ({ title, body }) => {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  try {
    if (ANDROID) {
      PatrimoNotify.present(title, body, 'price-alerts');
      return;
    }
    await ios().scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // Best effort — l'alerte reste marquée déclenchée côté état même si la
    // notification système échoue.
  }
};

/**
 * Remplace tous les rappels mensuels de l'app par ceux demandés.
 * @param {Array<{id: string, day: number, title: string, body: string}>} reminders
 */
export const syncMonthlyReminders = async (reminders) => {
  try {
    if (ANDROID) {
      if (!PatrimoNotify) return;
      const list = reminders.length && (await ensureNotificationPermission()) ? reminders : [];
      PatrimoNotify.setMonthlyReminders(JSON.stringify(list.map((r) => ({
        id: `${REMINDER_PREFIX}${r.id}`, day: r.day, hour: 9, minute: 0, title: r.title, body: r.body,
      }))));
      return;
    }
    if (!IOS) return;
    const Notifications = ios();
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
      trigger: { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day: r.day, hour: 9, minute: 0 },
    })));
  } catch {
    // Rappels facultatifs : un échec ne doit rien bloquer.
  }
};
