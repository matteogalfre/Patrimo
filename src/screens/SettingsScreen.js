import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { backupService } from '../services/storage';
import { wipeData } from '../services/wipe';
import { useDataReset } from '../context/DataResetContext';
import { getCrashLog, clearCrashLog } from '../services/crashLog';
import { ConfirmModal, InputSheet, ResultModal } from '../components';
import Toggle from '../components/Toggle';
import PinLockScreen from '../components/PinLockScreen';
import ScreenHeader from '../components/ScreenHeader';
import styles from '../components/Settings/settingsStyles';
import {
  LanguageModal,
  CurrencyModal,
  ThemeModal,
  ImportModal,
} from '../components/Settings/SettingsModals';
import { getLocaleTag } from '../i18n';
import { APP_INFO } from '../constants';
import { isBiometricAvailable, authenticateBiometric } from '../utils/biometric';

const SettingsScreen = ({ navigation, route }) => {
  // Ancien lien de la carte PEA du tableau de bord : le PEA a son propre écran.
  useEffect(() => {
    if (route?.params?.section === 'pea') navigation.replace('AccountsSettings');
  }, [route?.params?.section, navigation]);

  const theme = useTheme();
  const { totals, transactions, dividends, reload, demo, setDemo } = usePortfolio();
  const { resetMemory } = useDataReset();
  const [demoBusy, setDemoBusy] = useState(false);
  const hasData = transactions.length + dividends.length > 0;

  const {
    t,
    language,
    isAutoLanguage,
    supportedLanguages,
    setLanguage,
    currency,
    currencySymbol,
    supportedCurrencies,
    setCurrency,
    setPeaSettings,
    privacyMode,
    togglePrivacyMode,
    pinHash,
    setPinHash,
    clearPin,
    biometricEnabled,
    setBiometricEnabled,
  } = useSettings();
  const {
    hasPassword,
    setBackupPassword,
    getBackupPassword,
    backupSettings,
    applyImported,
  } = usePlanning();

  const [isExporting, setIsExporting] = useState(false);
  const [passwordSheet, setPasswordSheet] = useState(false);
  // Sauvegarde protégée en attente de son mot de passe : { envelope, mode }.
  const [pendingImport, setPendingImport] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  // `undefined` = not yet hydrated, `null` = hydrated and confirmed empty.
  // This avoids the "Never → date" flicker we used to get on first render.
  const [lastBackup, setLastBackup] = useState(undefined);
  const [crashCount, setCrashCount] = useState(0);
  const [resultModal, setResultModal] = useState({ visible: false, success: true, message: '' });
  const [importModal, setImportModal] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [languageModal, setLanguageModal] = useState(false);
  const [currencyModal, setCurrencyModal] = useState(false);
  const [themeModal, setThemeModal] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showPinVerify, setShowPinVerify] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Charger la date de dernière sauvegarde — explicitly fall back to `null`
  // when the service returns nothing so the placeholder ("…") transitions
  // straight to the localized "Never" rather than flashing through it.
  useEffect(() => {
    backupService
      .getLastBackupDate()
      .then((value) => setLastBackup(value ?? null))
      .catch(() => setLastBackup(null));

    getCrashLog()
      .then((list) => setCrashCount(list.length))
      .catch(() => setCrashCount(0));
  }, []);

  // Disponibilité matérielle de la biométrie (pour n'afficher la bascule que
  // si l'appareil sait faire FaceID/empreinte).
  useEffect(() => {
    let alive = true;
    isBiometricAvailable().then((available) => {
      if (alive) setBiometricAvailable(available);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Journal d'erreurs : affiche la plus recente et vide la liste. Le detail
  // complet (pile d'appels) reste dans AsyncStorage, ici on montre l'essentiel.
  const handleShowCrashLog = useCallback(async () => {
    const list = await getCrashLog();
    if (list.length === 0) {
      setResultModal({ visible: true, success: true, message: t('settings.crashLogEmpty') });
      return;
    }
    const last = list[list.length - 1];
    const when = new Date(last.time).toLocaleString(language);
    setResultModal({
      visible: true,
      success: false,
      message: `${when}\n\n${last.message}`,
    });
    await clearCrashLog();
    setCrashCount(0);
  }, [t, language]);

  // Formater la date de backup
  const formatBackupDate = (date) => {
    if (date === undefined) return '…';
    if (!date) return t('common.never');
    return new Date(date).toLocaleDateString(getLocaleTag(language), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Exporter les données
  const handleExport = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);

    try {
      const password = await getBackupPassword();
      const result = await backupService.exportData(backupSettings(), { password });

      if (result.success) {
        setLastBackup(new Date());
        setResultModal({
          visible: true,
          success: true,
          title: t('settings.exportSuccessTitle'),
          message: `${t('settings.exportSuccess')}\n\n${t('settings.exportFile')}: ${result.fileName}${password ? `\n\n${t('backup.encryptedNote')}` : ''}`,
        });
      } else {
        setResultModal({
          visible: true,
          success: false,
          message: result.error === 'DEMO_MODE' ? t('demo.blocked') : result.error || t('errors.generic'),
        });
      }
    } catch (error) {
      setResultModal({
        visible: true,
        success: false,
        message: error.message,
      });
    } finally {
      setIsExporting(false);
    }
  }, [t, getBackupPassword, backupSettings]);

  // Fin d'import commune (fichier en clair ou déchiffré).
  const finishImport = useCallback(async (result) => {
    if (!result.success) {
      setResultModal({
        visible: true,
        success: false,
        message: result.error === 'UNKNOWN_FORMAT' ? t('settings.importUnknown') : result.error,
      });
      return;
    }
    if (result.settings?.currency) setCurrency(result.settings.currency);
    if (result.settings?.pea) setPeaSettings(result.settings.pea);
    if (result.settings?.planning) applyImported(result.settings.planning);
    await reload();
    const lines = [t('settings.importDone', { count: result.added })];
    if (result.skipped > 0) lines.push(t('settings.importSkipped', { count: result.skipped }));
    setResultModal({
      visible: true,
      success: true,
      title: t('settings.importSuccessTitle'),
      message: lines.join('\n\n'),
    });
  }, [reload, t, setCurrency, setPeaSettings, applyImported]);

  // Import d'une sauvegarde Patrimo, en remplacement ou en complément.
  const handleImport = useCallback(async (mode) => {
    setImportModal(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsImporting(true);
    try {
      const result = await backupService.importData({ mode });
      if (result.cancelled) return;
      if (result.error === 'DEMO_MODE') {
        setResultModal({ visible: true, success: false, message: t('demo.blocked') });
        return;
      }
      if (result.needsPassword) {
        setPendingImport({ envelope: result.envelope, mode });
        return;
      }
      await finishImport(result);
    } catch (error) {
      setResultModal({ visible: true, success: false, message: error.message });
    } finally {
      setIsImporting(false);
    }
  }, [finishImport, t]);

  const toggleDemo = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDemoBusy(true);
    try {
      await setDemo(!demo);
    } catch (error) {
      setResultModal({ visible: true, success: false, message: error.message });
    } finally {
      setDemoBusy(false);
    }
  }, [demo, setDemo]);

  // Mot de passe saisi pour une sauvegarde protégée.
  const unlockImport = useCallback(async ({ password }) => {
    if (!password) return t('backup.passwordRequired');
    let json;
    try {
      json = await backupService.decrypt(pendingImport.envelope, password);
    } catch {
      return t('backup.wrongPassword');
    }
    const { mode } = pendingImport;
    setPendingImport(null);
    setIsImporting(true);
    try {
      await finishImport(await backupService.applyBackup(json, { mode }));
    } finally {
      setIsImporting(false);
    }
    return null;
  }, [pendingImport, finishImport, t]);

  const togglePassword = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasPassword) await setBackupPassword(null);
    else setPasswordSheet(true);
  }, [hasPassword, setBackupPassword]);

  const savePassword = useCallback(async ({ password, confirm }) => {
    if (!password || password.length < 6) return t('backup.passwordTooShort');
    if (password !== confirm) return t('backup.passwordMismatch');
    await setBackupPassword(password);
    setPasswordSheet(false);
    return null;
  }, [setBackupPassword, t]);

  // Réinitialiser les données
  const handleReset = useCallback(async () => {
    setResetModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      await wipeData();
      // Les contextes sont remontés à la fermeture du message : cet écran
      // disparaît avec eux, l'app repart vide comme au premier lancement.
      setResultModal({
        visible: true,
        success: true,
        message: t('settings.deleteSuccess'),
        afterClose: resetMemory,
      });
    } catch (error) {
      setResultModal({
        visible: true,
        success: false,
        message: error.message,
      });
    }
  }, [resetMemory, t]);

  // Changer la langue
  const handleLanguageChange = useCallback((langCode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLanguage(langCode);
    setLanguageModal(false);
  }, [setLanguage]);

  // Changer la devise
  const handleCurrencyChange = useCallback((currCode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrency(currCode);
    setCurrencyModal(false);
  }, [setCurrency]);

  // Changer le thème
  const handleThemeChange = useCallback((option) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    theme.setThemePreference(option);
    setThemeModal(false);
  }, [theme]);

  const handlePinToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (pinHash) {
      setShowPinVerify(true);
    } else {
      setShowPinSetup(true);
    }
  }, [pinHash]);

  // Activer la biométrie exige une auth réussie d'abord (on ne veut pas
  // qu'un tiers active la protection avec son propre visage/doigt). La
  // désactivation est immédiate.
  const handleBiometricToggle = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (biometricEnabled) {
      setBiometricEnabled(false);
      return;
    }
    const ok = await authenticateBiometric(t('pinLock.biometricPrompt'));
    if (ok) {
      setBiometricEnabled(true);
      setResultModal({
        visible: true,
        success: true,
        message: t('settings.biometricEnabledMsg'),
      });
    }
  }, [biometricEnabled, setBiometricEnabled, t]);

  const handlePinVerifySuccess = useCallback(async () => {
    setShowPinVerify(false);
    try {
      await clearPin();
      setResultModal({
        visible: true,
        success: true,
        message: t('settings.pinRemoved'),
      });
    } catch (err) {
      setResultModal({
        visible: true,
        success: false,
        message: `${t('common.error')}: ${err.message}`,
      });
    }
  }, [clearPin, t]);

  const handlePinSetSuccess = useCallback(async (hash) => {
    setShowPinSetup(false);
    try {
      await setPinHash(hash);
      setResultModal({
        visible: true,
        success: true,
        message: t('settings.pinSet'),
      });
    } catch (err) {
      setResultModal({
        visible: true,
        success: false,
        message: `${t('common.error')}: ${err.message}`,
      });
    }
  }, [setPinHash, t]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <ScreenHeader
            title={t('settings.title')}
            left={
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
                accessibilityLabel={t('common.back')}
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            }
            right={<View style={{ width: 40 }} />}
          />
        </Animated.View>

        {/* Stats Card */}
        <Animated.View
          entering={FadeIn.delay(100).duration(400)}
          style={[styles.statsCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <View style={[styles.statsIcon, { backgroundColor: theme.colors.primaryMuted }]}>
            <Ionicons name="analytics" size={24} color={theme.colors.primary} />
          </View>
          <Text style={[styles.statsTitle, { color: theme.colors.text }]}>
            {t('settings.yourData')}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>{totals.heldCount}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>{t('settings.assets')}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>{transactions.length + dividends.length}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>{t('settings.transactions')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Préférences Section */}
        <Animated.View entering={FadeIn.delay(150).duration(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('settings.preferences')}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {/* Langue */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setLanguageModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('settings.language')}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="language" size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>
                    {t('settings.language')}
                  </Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>
                    {isAutoLanguage ? `Auto (${supportedLanguages[language]?.nativeName})` : supportedLanguages[language]?.nativeName}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />

            {/* Devise */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCurrencyModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('settings.currency')}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="cash" size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>
                    {t('settings.currency')}
                  </Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>
                    {currency} ({currencySymbol})
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />

            {/* Thème */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('settings.theme')}
              accessibilityValue={{ text: t(`settings.themeOption.${theme.themePreference}`) }}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons
                    name={theme.isDark ? 'moon' : 'sunny'}
                    size={18}
                    color={theme.colors.primary}
                  />
                </View>
                <View>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>
                    {t('settings.theme')}
                  </Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>
                    {t(`settings.themeOption.${theme.themePreference}`)}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />

            {/* Mode discret */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                togglePrivacyMode();
              }}
              accessibilityRole="switch"
              accessibilityLabel={t('privacy.title')}
              accessibilityState={{ checked: privacyMode }}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name={privacyMode ? 'eye-off' : 'eye'} size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('privacy.title')}</Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{t('privacy.subtitle')}</Text>
                </View>
              </View>
              <View style={[styles.toggle, { backgroundColor: privacyMode ? theme.colors.primary : theme.colors.border }]}>
                <View style={[styles.toggleDot, { backgroundColor: '#FFF', transform: [{ translateX: privacyMode ? 18 : 2 }] }]} />
              </View>
            </TouchableOpacity>

            <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />

            {/* PIN Lock */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={handlePinToggle}
              accessibilityRole="switch"
              accessibilityLabel={t('settings.pinLock')}
              accessibilityState={{ checked: !!pinHash }}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons
                    name={pinHash ? 'lock-closed' : 'lock-open'}
                    size={18}
                    color={theme.colors.primary}
                  />
                </View>
                <View>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>
                    {t('settings.pinLock')}
                  </Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>
                    {pinHash ? t('common.enabled') : t('common.disabled')}
                  </Text>
                </View>
              </View>
              <View style={[
                styles.toggle,
                { backgroundColor: pinHash ? theme.colors.primary : theme.colors.border }
              ]}>
                <View style={[
                  styles.toggleDot,
                  {
                    backgroundColor: '#FFF',
                    transform: [{ translateX: pinHash ? 18 : 2 }]
                  }
                ]} />
              </View>
            </TouchableOpacity>

            {/* Biométrie — seulement si un PIN est défini ET le matériel est
                disponible. C'est un complément au PIN, pas un remplaçant. */}
            {pinHash && biometricAvailable && (
              <>
                <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />
                <TouchableOpacity
                  style={styles.settingRow}
                  onPress={handleBiometricToggle}
                  accessibilityLabel={t('settings.biometric')}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: biometricEnabled }}
                >
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                      <Ionicons name="finger-print" size={18} color={theme.colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.settingTitle, { color: theme.colors.text }]}>
                        {t('settings.biometric')}
                      </Text>
                      <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>
                        {biometricEnabled ? t('common.enabled') : t('common.disabled')}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.toggle,
                    { backgroundColor: biometricEnabled ? theme.colors.primary : theme.colors.border }
                  ]}>
                    <View style={[
                      styles.toggleDot,
                      {
                        backgroundColor: '#FFF',
                        transform: [{ translateX: biometricEnabled ? 18 : 2 }]
                      }
                    ]} />
                  </View>
                </TouchableOpacity>
              </>
            )}

          </View>
        </Animated.View>

        {/* Sauvegarde Section */}
        <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('settings.backupRestore')}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {/* Info sauvegarde */}
            <View style={[styles.infoBox, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="information-circle" size={20} color={theme.colors.primary} />
              <Text style={[styles.infoText, { color: theme.colors.text }]}>
                {t('settings.backupInfo')}
              </Text>
            </View>

            {/* Dernière sauvegarde */}
            <View style={styles.lastBackup}>
              <Text style={[styles.lastBackupLabel, { color: theme.colors.textSecondary }]}>
                {t('settings.lastBackup')}
              </Text>
              <Text style={[styles.lastBackupValue, { color: theme.colors.text }]}>
                {formatBackupDate(lastBackup)}
              </Text>
            </View>

            {/* Journal d'erreurs local : seule trace disponible en production,
                aucune donnee ne quitte l'appareil. */}
            {crashCount > 0 && (
              <TouchableOpacity
                style={styles.lastBackup}
                onPress={handleShowCrashLog}
                accessibilityRole="button"
                accessibilityLabel={t('settings.crashLog')}
              >
                <Text style={[styles.lastBackupLabel, { color: theme.colors.textSecondary }]}>
                  {t('settings.crashLog')}
                </Text>
                <Text style={[styles.lastBackupValue, { color: theme.colors.error }]}>
                  {t('settings.crashLogCount', { count: crashCount })}
                </Text>
              </TouchableOpacity>
            )}

            {/* Boutons */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
              onPress={handleExport}
              disabled={isExporting || !hasData}
              accessibilityRole="button"
              accessibilityState={{ disabled: isExporting || !hasData }}
              accessibilityLabel={t('settings.exportBackup')}
            >
              {isExporting ? (
                <ActivityIndicator color={theme.colors.onPrimary} size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color={theme.colors.onPrimary} />
                  <Text style={[styles.actionBtnText, { color: theme.colors.onPrimary }]}>
                    {t('settings.exportBackup')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary, { borderColor: theme.colors.border }]}
              onPress={() => setImportModal(true)}
              disabled={isImporting}
              accessibilityRole="button"
              accessibilityState={{ disabled: isImporting }}
              accessibilityLabel={t('settings.importBackup')}
            >
              {isImporting ? (
                <ActivityIndicator color={theme.colors.primary} size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.primary} />
                  <Text style={[styles.actionBtnTextSecondary, { color: theme.colors.text }]}>
                    {t('settings.importBackup')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={[styles.settingDivider, styles.dividerFull, { backgroundColor: theme.colors.border }]} />

            {/* Mot de passe des sauvegardes */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={togglePassword}
              accessibilityRole="switch"
              accessibilityLabel={t('backup.passwordTitle')}
              accessibilityState={{ checked: hasPassword }}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('backup.passwordTitle')}</Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>
                    {hasPassword ? t('backup.passwordOn') : t('backup.passwordOff')}
                  </Text>
                </View>
              </View>
              <Toggle value={hasPassword} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Comptes et courtiers : PEA, établissements, frais de courtage */}
        <Animated.View entering={FadeIn.delay(250).duration(400)} style={styles.section}>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('AccountsSettings');
              }}
              accessibilityLabel={t('accountsSettings.title')}
              accessibilityRole="button"
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="briefcase-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('accountsSettings.title')}</Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{t('accountsSettings.subtitle')}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Banques reliées : un réglage du compte. Les outils ont leur onglet. */}
        <Animated.View entering={FadeIn.delay(275).duration(400)} style={styles.section}>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('BankConnections');
              }}
              accessibilityLabel={t('banks.title')}
              accessibilityRole="button"
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="link-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('banks.title')}</Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{t('banks.entrySubtitle')}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Données d'exemple */}
        <Animated.View entering={FadeIn.delay(280).duration(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>{t('demo.section')}</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={toggleDemo}
              disabled={demoBusy}
              accessibilityRole="switch"
              accessibilityLabel={t('demo.title')}
              accessibilityState={{ checked: demo, busy: demoBusy }}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="flask-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('demo.title')}</Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{t('demo.sub')}</Text>
                </View>
              </View>
              {demoBusy ? <ActivityIndicator color={theme.colors.primary} size="small" /> : <Toggle value={demo} />}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* À propos : l'app est libre, aider à la faire connaître et progresser */}
        <Animated.View entering={FadeIn.delay(290).duration(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>{t('about.section')}</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {[
              { icon: 'star-outline', title: 'about.star', sub: 'about.starSub', url: APP_INFO.repo },
              { icon: 'bug-outline', title: 'about.bug', sub: 'about.bugSub', url: `${APP_INFO.repo}/issues/new/choose` },
              { icon: 'language-outline', title: 'about.translate', sub: 'about.translateSub', url: `${APP_INFO.repo}/tree/main/src/i18n/translations` },
            ].map((row, i) => (
              <TouchableOpacity
                key={row.icon}
                style={[styles.settingRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}
                onPress={() => { Haptics.selectionAsync(); Linking.openURL(row.url).catch(() => {}); }}
                accessibilityRole="link"
                accessibilityLabel={t(row.title)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                    <Ionicons name={row.icon} size={18} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t(row.title)}</Text>
                    <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{t(row.sub)}</Text>
                  </View>
                </View>
                <Ionicons name="open-outline" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.settingSubtitle, { color: theme.colors.textTertiary, textAlign: 'center', marginTop: 10 }]}>
            {t('about.version', { version: APP_INFO.version })}
          </Text>
        </Animated.View>

        {/* Zone Danger */}
        <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.error }]}>
            {t('settings.dangerZone')}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: theme.colors.error }]}
              onPress={() => setResetModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('settings.deleteAll')}
            >
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              <Text style={[styles.dangerBtnText, { color: theme.colors.error }]}>
                {t('settings.deleteAll')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <LanguageModal
        visible={languageModal}
        onClose={() => setLanguageModal(false)}
        t={t}
        theme={theme}
        isAutoLanguage={isAutoLanguage}
        language={language}
        supportedLanguages={supportedLanguages}
        onSelect={handleLanguageChange}
      />

      <CurrencyModal
        visible={currencyModal}
        onClose={() => setCurrencyModal(false)}
        t={t}
        theme={theme}
        currency={currency}
        supportedCurrencies={supportedCurrencies}
        onSelect={handleCurrencyChange}
      />

      <ThemeModal
        visible={themeModal}
        onClose={() => setThemeModal(false)}
        t={t}
        theme={theme}
        onSelect={handleThemeChange}
      />

      <ImportModal
        visible={importModal}
        onClose={() => setImportModal(false)}
        t={t}
        theme={theme}
        onReplace={() => handleImport('replace')}
        onMerge={() => handleImport('merge')}
      />

      <InputSheet
        visible={passwordSheet}
        onClose={() => setPasswordSheet(false)}
        title={t('backup.passwordTitle')}
        message={t('backup.passwordWarning')}
        fields={[
          { key: 'password', label: t('backup.password'), secure: true },
          { key: 'confirm', label: t('backup.passwordConfirm'), secure: true },
        ]}
        confirmText={t('common.save')}
        onSubmit={savePassword}
      />

      <InputSheet
        visible={!!pendingImport}
        onClose={() => setPendingImport(null)}
        title={t('backup.unlockTitle')}
        message={t('backup.unlockMessage')}
        fields={[{ key: 'password', label: t('backup.password'), secure: true }]}
        confirmText={t('backup.unlock')}
        onSubmit={unlockImport}
      />

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        visible={resetModal}
        onClose={() => setResetModal(false)}
        onConfirm={handleReset}
        title={t('settings.deleteAllTitle')}
        message={t('settings.deleteAllMsg')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        destructive
        icon="warning"
      />

      {/* Result Modal */}
      <ResultModal
        visible={resultModal.visible}
        onClose={() => {
          setResultModal({ ...resultModal, visible: false, afterClose: null });
          resultModal.afterClose?.();
        }}
        success={resultModal.success}
        title={resultModal.title}
        message={resultModal.message}
      />

      {/* PIN Setup Screen */}
      {showPinSetup && (
        <PinLockScreen
          mode="set"
          onSuccess={handlePinSetSuccess}
          onCancel={() => setShowPinSetup(false)}
          t={t}
          theme={theme}
        />
      )}

      {/* PIN Verify to disable — on autorise la biométrie ici aussi, sinon un
          utilisateur qui déverrouille toujours au visage/empreinte ne peut
          plus jamais désactiver le PIN (il ne se souvient plus du code). */}
      {showPinVerify && (
        <PinLockScreen
          mode="unlock"
          currentPin={pinHash}
          biometricEnabled={biometricEnabled}
          onSuccess={handlePinVerifySuccess}
          onCancel={() => setShowPinVerify(false)}
          t={t}
          theme={theme}
        />
      )}
    </SafeAreaView>
  );
};

export default SettingsScreen;
