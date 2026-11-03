/**
 * Journal d'erreurs local et persistant.
 *
 * Sans dependance ni service externe : un anneau tampon de 30 entrees dans
 * AsyncStorage. L'ErrorBoundary ne faisait que `console.error` sous `__DEV__`,
 * donc en production l'utilisateur voyait l'ecran de repli et l'erreur
 * disparaissait sans trace. Ici elle survit au redemarrage, ce qui permet de
 * comprendre un crash apres coup.
 *
 * Volontairement local : aucune telemetrie, rien ne quitte l'appareil.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';

const MAX_ENTRIES = 30;
const MAX_STACK_CHARS = 2000;

/**
 * @typedef {{ time: string, message: string, stack?: string, componentStack?: string }} CrashEntry
 */

/** Enregistre une erreur. Ne leve jamais : journaliser ne doit pas faire crasher. */
export async function recordCrash(error, errorInfo) {
  try {
    const entry = {
      time: new Date().toISOString(),
      message: String(error?.message || error || 'Erreur inconnue').slice(0, 500),
      stack: error?.stack ? String(error.stack).slice(0, MAX_STACK_CHARS) : undefined,
      componentStack: errorInfo?.componentStack
        ? String(errorInfo.componentStack).slice(0, MAX_STACK_CHARS)
        : undefined,
    };

    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CRASH_LOG);
    const list = raw ? JSON.parse(raw) : [];
    list.push(entry);
    while (list.length > MAX_ENTRIES) list.shift();

    await AsyncStorage.setItem(STORAGE_KEYS.CRASH_LOG, JSON.stringify(list));
  } catch {
    // Un echec d'ecriture ne doit surtout pas masquer l'erreur d'origine.
  }
}

/** @returns {Promise<CrashEntry[]>} du plus ancien au plus recent */
export async function getCrashLog() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CRASH_LOG);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function clearCrashLog() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.CRASH_LOG);
    return true;
  } catch {
    return false;
  }
}

export default { recordCrash, getCrashLog, clearCrashLog };
