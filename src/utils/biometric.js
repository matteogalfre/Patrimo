/**
 * Fine wrapper autour d'expo-local-authentication.
 *
 * On garde toute la logique d'erreur ici afin que l'UI (PinLockScreen,
 * SettingsScreen) reste déclarative : elle interroge `isBiometricAvailable`
 * et déclenche `authenticate`, sans connaître les détails de la plateforme.
 * L'import est paresseux/optionnel pour ne jamais crasher si le module natif
 * n'est pas présent (ex: Expo Go sans dev build).
 */

import * as LocalAuthentication from 'expo-local-authentication';

/**
 * La biométrie est-elle utilisable ? Vrai uniquement si le device a le
 * matériel ET au moins une empreinte/visage enregistré.
 * @returns {Promise<boolean>}
 */
export const isBiometricAvailable = async () => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return !!isEnrolled;
  } catch {
    return false;
  }
};

/**
 * Type de biométrie disponible, pour adapter le libellé/icône.
 * @returns {Promise<'face'|'fingerprint'|'iris'|'generic'>}
 */
export const getBiometricType = async () => {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'face';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'iris';
    }
    return 'generic';
  } catch {
    return 'generic';
  }
};

/**
 * Lance l'invite biométrique système.
 * @param {string} promptMessage Message affiché dans l'invite native.
 * @returns {Promise<boolean>} true si authentifié.
 */
export const authenticateBiometric = async (promptMessage) => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      // On laisse l'utilisateur retomber sur son code device, mais on ne
      // veut pas que le bouton « annuler » ferme silencieusement : l'UI gère
      // le repli vers le PIN applicatif.
      disableDeviceFallback: false,
      cancelLabel: undefined,
    });
    return !!result.success;
  } catch {
    return false;
  }
};
