import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/theme';
import {
  verifyPin,
  createPinHash,
  isV2Hash,
  savePinHashSecure,
  recordFailedAttempt,
  clearFailedAttempts,
  getAttemptState,
} from '../utils/pinSecurity';
import {
  isBiometricAvailable,
  getBiometricType,
  authenticateBiometric,
} from '../utils/biometric';

const BIOMETRIC_ICONS = {
  face: 'scan-outline',
  fingerprint: 'finger-print',
  iris: 'eye-outline',
  generic: 'finger-print',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DOT_SIZE = 14;
const DOT_GAP = 24;
const KEY_SIZE = Math.min(72, (SCREEN_WIDTH - 80) / 3 - 16);
const KEY_GAP = 16;
const ERROR_DISPLAY_MS = 400;

const triggerLightHaptic = () => {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

const triggerErrorHaptic = () => {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
};

const triggerSuccessHaptic = () => {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

const PinDot = ({ filled, error, theme }) => {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (filled) {
      scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    }
  }, [filled, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgColor = error
    ? theme.colors.error
    : filled
      ? theme.colors.primary
      : 'transparent';

  const borderColor = error
    ? theme.colors.error
    : filled
      ? theme.colors.primary
      : theme.colors.textTertiary + '60';

  return (
    <Animated.View
      style={[
        styles.dot,
        animStyle,
        { backgroundColor: bgColor, borderColor },
      ]}
    />
  );
};

const formatRemaining = (ms) => {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  if (mm <= 0) return `${ss}s`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
};

const PinLockScreen = ({
  mode,
  currentPin,
  onSuccess,
  onCancel,
  onForgotPin,
  biometricEnabled = false,
  t,
  theme: themeProp,
}) => {
  const themeFromContext = useTheme();
  const theme = themeProp ?? themeFromContext;

  const [digits, setDigits] = useState('');
  const [setPhase, setSetPhase] = useState('first');
  const [firstPin, setFirstPin] = useState('');
  const [dotsError, setDotsError] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [biometricType, setBiometricType] = useState(null);
  const clearErrorTimer = useRef(null);
  const biometricPrompted = useRef(false);

  const shakeX = useSharedValue(0);

  const shakeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const runShake = useCallback(() => {
    shakeX.value = withSequence(
      withTiming(-12, { duration: 50 }),
      withTiming(12, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }, [shakeX]);

  const clearDigitsAfterError = useCallback(() => {
    if (clearErrorTimer.current) {
      clearTimeout(clearErrorTimer.current);
    }
    setDotsError(true);
    runShake();
    triggerErrorHaptic();
    clearErrorTimer.current = setTimeout(() => {
      setDotsError(false);
      setDigits('');
      clearErrorTimer.current = null;
    }, ERROR_DISPLAY_MS);
  }, [runShake]);

  // Hydrate any persisted lockout when unlock screen mounts.
  useEffect(() => {
    if (mode !== 'unlock') return;
    let alive = true;
    getAttemptState().then(({ lockoutUntil: until }) => {
      if (alive && until > Date.now()) setLockoutUntil(until);
    });
    return () => {
      alive = false;
    };
  }, [mode]);

  // Tick once per second while a lockout is active, then auto-clear.
  useEffect(() => {
    if (!lockoutUntil) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  useEffect(() => {
    if (lockoutUntil && lockoutUntil <= now) {
      setLockoutUntil(0);
    }
  }, [lockoutUntil, now]);

  useEffect(() => {
    return () => {
      if (clearErrorTimer.current) {
        clearTimeout(clearErrorTimer.current);
      }
    };
  }, []);

  // Détecte la disponibilité biométrique (mode unlock + préférence activée).
  useEffect(() => {
    if (mode !== 'unlock' || !biometricEnabled) return;
    let alive = true;
    (async () => {
      const available = await isBiometricAvailable();
      if (!alive || !available) return;
      const type = await getBiometricType();
      if (alive) setBiometricType(type);
    })();
    return () => {
      alive = false;
    };
  }, [mode, biometricEnabled]);

  const runBiometric = useCallback(async () => {
    if (lockoutUntil > Date.now()) return;
    const ok = await authenticateBiometric(t('pinLock.biometricPrompt'));
    if (ok) {
      triggerSuccessHaptic();
      await clearFailedAttempts();
      onSuccess?.();
    }
  }, [lockoutUntil, t, onSuccess]);

  // Invite biométrique automatique au montage (une seule fois) une fois le
  // type détecté, sauf si un lockout est actif.
  useEffect(() => {
    if (mode !== 'unlock' || !biometricEnabled || !biometricType) return;
    if (biometricPrompted.current) return;
    if (lockoutUntil > Date.now()) return;
    biometricPrompted.current = true;
    runBiometric();
  }, [mode, biometricEnabled, biometricType, lockoutUntil, runBiometric]);

  const handleComplete = useCallback(
    async (pin) => {
      if (mode === 'unlock') {
        const ok = await verifyPin(pin, currentPin);
        if (ok) {
          triggerSuccessHaptic();
          setDigits('');
          await clearFailedAttempts();
          // Silently upgrade legacy hashes once we know the plain PIN.
          if (!isV2Hash(currentPin)) {
            try {
              const upgraded = await createPinHash(pin);
              await savePinHashSecure(upgraded);
              onSuccess?.(upgraded);
              return;
            } catch {
              // Fall through and unlock normally even if upgrade failed.
            }
          }
          onSuccess?.();
          return;
        }

        const { lockoutUntil: until } = await recordFailedAttempt();
        if (until > Date.now()) setLockoutUntil(until);
        clearDigitsAfterError();
        return;
      }

      if (mode === 'set') {
        if (setPhase === 'first') {
          triggerSuccessHaptic();
          setFirstPin(pin);
          setDigits('');
          setSetPhase('confirm');
          return;
        }
        if (pin === firstPin) {
          try {
            const hash = await createPinHash(pin);
            triggerSuccessHaptic();
            onSuccess?.(hash);
          } catch {
            clearDigitsAfterError();
            return;
          }
          setDigits('');
          setSetPhase('first');
          setFirstPin('');
        } else {
          clearDigitsAfterError();
        }
      }
    },
    [mode, currentPin, onSuccess, setPhase, firstPin, clearDigitsAfterError],
  );

  useEffect(() => {
    if (digits.length !== 4) return;
    const timer = setTimeout(() => handleComplete(digits), 80);
    return () => clearTimeout(timer);
  }, [digits, handleComplete]);

  const isLocked = lockoutUntil > now;

  const appendDigit = (d) => {
    if (isLocked) return;
    triggerLightHaptic();
    setDigits((prev) => (prev.length >= 4 ? prev : prev + d));
  };

  const backspace = () => {
    triggerLightHaptic();
    setDigits((prev) => prev.slice(0, -1));
  };

  const subtitle =
    mode === 'unlock'
      ? t('pinLock.enterPin')
      : setPhase === 'first'
        ? t('pinLock.choosePin')
        : t('pinLock.confirmPin');

  const renderKey = (cell) => {
    if (cell === null) {
      return <View style={styles.keySpacer} />;
    }

    if (cell === 'back') {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.keyCircle,
            { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
            isLocked && styles.keyDisabled,
          ]}
          onPress={backspace}
          accessibilityRole="button"
          accessibilityLabel={t('pinLock.backspace')}
          disabled={isLocked}
        >
          <Ionicons
            name="backspace-outline"
            size={26}
            color={theme.colors.textSecondary}
          />
        </Pressable>
      );
    }

    return (
      <Pressable
        style={({ pressed }) => [
          styles.keyCircle,
          { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
          isLocked && styles.keyDisabled,
        ]}
        onPress={() => appendDigit(cell)}
        accessibilityRole="keyboardkey"
        accessibilityLabel={cell}
        disabled={isLocked}
      >
        <Text style={[styles.keyDigit, { color: theme.colors.text }]}>
          {cell}
        </Text>
      </Pressable>
    );
  };

  return (
    // Présenté dans un vrai Modal RN : garantit un rendu plein écran AU-DESSUS
    // de tout le reste (sur certains Android, un simple overlay en
    // position:absolute pouvait rester derrière le contenu de l'écran → le
    // clavier PIN ne s'affichait pas). `onRequestClose` gère le bouton retour
    // Android : on annule si un onCancel est fourni (écran Réglages), sinon on
    // ne fait rien (verrouillage de l'app : on ne doit pas pouvoir le fermer).
    <Modal
      visible
      transparent={false}
      statusBarTranslucent
      animationType="fade"
      onRequestClose={() => onCancel?.()}
    >
      <View style={[styles.overlay, { backgroundColor: theme.colors.background }]}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          {/* Header */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
          <View style={[styles.lockIconContainer, { backgroundColor: theme.colors.primary + '15' }]}>
            <Ionicons
              name="lock-closed"
              size={28}
              color={theme.colors.primary}
            />
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            {subtitle}
          </Text>
          {isLocked && (
            <Text style={[styles.lockoutText, { color: theme.colors.error }]}>
              {t('pinLock.lockedFor', { time: formatRemaining(lockoutUntil - now) })}
            </Text>
          )}
        </Animated.View>

        {/* Dots */}
        <Animated.View style={[styles.dotsRow, shakeAnimatedStyle]}>
          {[0, 1, 2, 3].map((i) => (
            <PinDot
              key={i}
              filled={i < digits.length}
              error={dotsError}
              theme={theme}
            />
          ))}
        </Animated.View>

        {/* Keypad */}
        <View style={styles.keypad}>
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
            [onCancel ? 'cancel' : null, '0', 'back'],
          ].map((row, ri) => (
            <View key={ri} style={styles.keypadRow}>
              {row.map((cell, ci) => {
                if (cell === 'cancel') {
                  return (
                    <Pressable
                      key="cancel"
                      style={({ pressed }) => [
                        styles.keyCircle,
                        { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
                      ]}
                      onPress={() => {
                        triggerLightHaptic();
                        setDigits('');
                        setSetPhase('first');
                        setFirstPin('');
                        onCancel();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('pinLock.cancel')}
                    >
                      <Text style={[styles.cancelKeyText, { color: theme.colors.textSecondary }]}>
                        {t('pinLock.cancel')}
                      </Text>
                    </Pressable>
                  );
                }
                return (
                  <View key={cell ?? `empty-${ci}`}>
                    {renderKey(cell)}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* Bouton biométrie : relance l'invite si l'utilisateur l'a fermée
            ou veut explicitement l'utiliser. Caché pendant un lockout. */}
        {mode === 'unlock' && biometricEnabled && biometricType && !isLocked && (
          <Pressable
            onPress={runBiometric}
            accessibilityRole="button"
            accessibilityLabel={t('pinLock.useBiometric')}
            style={({ pressed }) => [
              styles.biometricBtn,
              { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
            ]}
          >
            <Ionicons
              name={BIOMETRIC_ICONS[biometricType] || BIOMETRIC_ICONS.generic}
              size={28}
              color={theme.colors.primary}
            />
            <Text style={[styles.biometricBtnText, { color: theme.colors.primary }]}>
              {t('pinLock.useBiometric')}
            </Text>
          </Pressable>
        )}

        {/* Escape hatch: when the user has forgotten their PIN, the only way
            back into the app is a destructive data wipe. We confirm twice
            so this is impossible to trigger by accident. */}
        {mode === 'unlock' && onForgotPin && (
          <Pressable
            onPress={() => {
              Alert.alert(
                t('pinLock.forgotTitle'),
                t('pinLock.forgotMessage'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('pinLock.forgotConfirm'),
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert(
                        t('pinLock.forgotFinalTitle'),
                        t('pinLock.forgotFinalMessage'),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('pinLock.forgotFinalConfirm'),
                            style: 'destructive',
                            onPress: () => onForgotPin(),
                          },
                        ],
                      );
                    },
                  },
                ],
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={t('pinLock.forgotLink')}
            style={styles.forgotLinkWrap}
          >
            <Text style={[styles.forgotLink, { color: theme.colors.textTertiary }]}>
              {t('pinLock.forgotLink')}
            </Text>
          </Pressable>
        )}

        <View style={styles.bottomSpacer} />
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    zIndex: 9999,
  },
  safe: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: 48,
  },
  lockIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  lockoutText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: DOT_GAP,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
  },
  keypad: {
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: KEY_GAP / 2,
  },
  keySpacer: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    marginHorizontal: KEY_GAP / 2,
  },
  keyCircle: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    marginHorizontal: KEY_GAP / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyDisabled: {
    opacity: 0.35,
  },
  keyDigit: {
    fontSize: 30,
    fontWeight: '300',
  },
  cancelKeyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  biometricBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  forgotLinkWrap: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  bottomSpacer: {
    height: 16,
  },
});

export default PinLockScreen;
export { PinLockScreen };
