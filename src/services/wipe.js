/**
 * Effacement complet : « Tout effacer » dans les Réglages et « PIN oublié ».
 *
 * Vider le stockage ne suffit pas : les accords bancaires restent ouverts
 * chez GoCardless, les clés dans le coffre du téléphone, les rappels
 * programmés et le widget affiche encore l'ancien patrimoine. Les contextes
 * en mémoire, eux, sont remontés par l'appelant (voir DataResetContext).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '../constants';
import { backupService, demoMode } from './storage';
import { gocardless } from './gocardless';
import { syncMonthlyReminders } from './notifications';

// Même clé que PlanningContext (mot de passe des sauvegardes chiffrées).
const BACKUP_PASSWORD_KEY = 'patrimo.backup.password';

/** Révoque chaque accord bancaire, au mieux et sans attendre plus de quelques secondes. */
const revokeBankLinks = async () => {
  try {
    if (!(await gocardless.hasCredentials())) return;
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.BANK_LINKS);
    const links = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(links) || !links.length) return;
    const all = Promise.all(links.filter((l) => l?.id).map((l) => gocardless.deleteRequisition(l.id)));
    let timer;
    await Promise.race([all, new Promise((resolve) => { timer = setTimeout(resolve, 8000); })]);
    clearTimeout(timer);
  } catch {
    // Hors ligne : les accords expireront d'eux-mêmes (90 jours au plus).
  }
};

const forgetDevice = async () => {
  await gocardless.clearCredentials().catch(() => {});
  await syncMonthlyReminders([]);
  try {
    const { updateWidget } = require('../widget');
    await updateWidget();
  } catch {
    // Pas de widget (tests, iOS).
  }
};

/**
 * « Tout effacer » : les données, la banque, les rappels ; les réglages
 * (langue, thème, PIN) restent. En mode démo, seul l'exemple est effacé.
 */
export const wipeData = async () => {
  if (await demoMode.isOn()) {
    await backupService.clearAll();
    return;
  }
  await revokeBankLinks();
  await backupService.clearAll();
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.PRICE_ALERTS,
    STORAGE_KEYS.WIDGET_DATA,
    STORAGE_KEYS.WIDGET_LAST_UPDATE,
    STORAGE_KEYS.LAST_BACKUP,
  ]).catch(() => {});
  await forgetDevice();
};

/** « PIN oublié » : tout, réglages compris, comme au premier lancement. */
export const wipeEverything = async () => {
  await revokeBankLinks();
  await AsyncStorage.clear().catch(() => {});
  await demoMode.disable().catch(() => {});
  // Le mot de passe des sauvegardes vit dans le coffre, pas dans AsyncStorage.
  await SecureStore.deleteItemAsync(BACKUP_PASSWORD_KEY).catch(() => {});
  await forgetDevice();
};
