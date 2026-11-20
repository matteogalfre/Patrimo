import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
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
import { getCrashLog, clearCrashLog } from '../services/crashLog';
import { ConfirmModal, InputSheet, OptionSheet, ResultModal } from '../components';
import Toggle from '../components/Toggle';
import DateField from '../components/Transaction/DateField';
import PinLockScreen from '../components/PinLockScreen';
import ScreenHeader from '../components/ScreenHeader';
import {
  LanguageModal,
  CurrencyModal,
  ThemeModal,
  ImportModal,
} from '../components/Settings/SettingsModals';
import { getLocaleTag } from '../i18n';
import { formatDate, formatPercent } from '../utils/formatters';
import AssetLogo from '../components/AssetLogo';
import { institutionById, searchInstitutions } from '../core/institutions';
import { normalizeRule, tariffOf, tariffsFor, tariffById } from '../core/brokerFees';
import { tariffLabel } from '../constants/brokerTariffs';
import { isBiometricAvailable, authenticateBiometric } from '../utils/biometric';

const SettingsScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { totals, transactions, dividends, pea, reload, demo, setDemo } = usePortfolio();
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
    formatAmount,
    locale,
    settings,
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
    brokerRules,
    setBrokerRule,
    ttf,
    setTtf,
    accountInstitutions,
    setAccountInstitution,
  } = usePlanning();

  const [isExporting, setIsExporting] = useState(false);
  const [passwordSheet, setPasswordSheet] = useState(false);
  // Frais de courtage : enveloppe dont on choisit la règle, puis saisie d'un pourcentage ou d'un montant.
  const [brokerPick, setBrokerPick] = useState(null);
  const [brokerInput, setBrokerInput] = useState(null); // { account, type }
  // Établissement d'une enveloppe (PEA chez Bourse Direct…).
  const [institutionPick, setInstitutionPick] = useState(null);
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
  const [depositsInput, setDepositsInput] = useState(
    settings.pea?.depositsOverride > 0 ? String(settings.pea.depositsOverride) : '',
  );
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showPinVerify, setShowPinVerify] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Arrivée depuis la carte PEA du tableau de bord : on fait défiler jusqu'à
  // la section PEA une fois sa position connue.
  const scrollRef = useRef(null);
  const peaY = useRef(null);
  const wantsPea = route?.params?.section === 'pea';
  const onPeaLayout = useCallback((e) => {
    peaY.current = e.nativeEvent.layout.y;
    if (wantsPea) scrollRef.current?.scrollTo({ y: Math.max(0, peaY.current - 16), animated: true });
  }, [wantsPea]);

  const saveDeposits = useCallback(() => {
    const n = Number(String(depositsInput).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
    setPeaSettings({ depositsOverride: n > 0 ? n : null });
    if (!(n > 0)) setDepositsInput('');
  }, [depositsInput, setPeaSettings]);

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

  // Barème lisible : « 0,99 à 3,80 € jusqu'à 4 400 €, puis 0,09 % », « 1 € par ordre »…
  const money = (v, code = 'EUR') => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
    } catch {
      return `${v} ${code}`;
    }
  };
  const pctText = (v) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 3 }).format(v / 100);
  const scheduleText = (sched, code) => {
    if (!sched) return '';
    const parts = [];
    if (sched.tiers?.length) {
      const first = sched.tiers[0];
      const last = sched.tiers[sched.tiers.length - 1];
      parts.push(sched.tiers.length > 1
        ? t('broker.sched.tiers', { from: money(first.fee, code), to: money(last.fee, code), limit: money(last.upTo, code) })
        : t('broker.sched.tier', { fee: money(first.fee, code), limit: money(last.upTo, code) }));
      parts.push(t('broker.sched.then', { pct: sched.pct ? pctText(sched.pct) : t('broker.sched.free') }));
    } else if (sched.fee && sched.pct) {
      parts.push(t('broker.sched.feePct', { fee: money(sched.fee, code), pct: pctText(sched.pct) }));
    } else if (sched.pct) {
      parts.push(t('broker.sched.pct', { pct: pctText(sched.pct) }));
    } else {
      parts.push(sched.fee ? t('broker.sched.fee', { fee: money(sched.fee, code) }) : t('broker.sched.free'));
    }
    if (sched.min) parts.push(t('broker.sched.min', { min: money(sched.min, code) }));
    if (sched.max != null) parts.push(t('broker.sched.max', { max: money(sched.max, code) }));
    return parts.join(', ');
  };
  const tariffText = (tariff) => {
    const mapText = (map) => Object.entries(map).map(([code, sched]) => {
      const text = scheduleText(sched, code === '*' ? 'EUR' : code);
      return code === '*' ? text : t(`broker.market.${code}`, { text });
    }).join(', ');
    const lines = [mapText(tariff.markets)];
    if (tariff.funds) lines.push(t('broker.forItem', { name: 'ETF', text: mapText(tariff.funds) }));
    // Les titres au même barème sur une ligne : « BTC, USDC, USDT : 0,99 % du montant ».
    const bySchedule = new Map();
    Object.entries(tariff.symbols || {}).forEach(([symbol, map]) => {
      const text = mapText(map);
      bySchedule.set(text, [...(bySchedule.get(text) || []), symbol]);
    });
    bySchedule.forEach((symbols, text) => lines.push(t('broker.forItem', { name: symbols.join(', '), text })));
    if (tariff.plan) lines.push(t('broker.sched.plan', { text: scheduleText(tariff.plan, 'EUR') }));
    lines.push(t('broker.asOf', { date: formatDate(tariff.asOf, { locale }) }));
    return lines.join('\n');
  };

  const brokerRuleText = (stored) => {
    const rule = normalizeRule(stored);
    if (!rule || rule.type === 'none') return t('broker.rules.none');
    const tariff = tariffOf(rule);
    if (tariff) return tariffLabel(tariff);
    if (rule.type === 'percent') {
      return t('broker.percentValue', {
        pct: formatPercent(rule.pct, { showSign: false, decimals: 2 }),
        min: formatAmount(rule.min || 0, { decimals: 2, reveal: true }),
      });
    }
    if (rule.type === 'fixed') return t('broker.fixedValue', { amount: formatAmount(rule.amount || 0, { decimals: 2, reveal: true }) });
    return t(`broker.rules.${rule.type}`);
  };

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
      await backupService.clearAll();
      await reload();
      setResultModal({
        visible: true,
        success: true,
        message: t('settings.deleteSuccess'),
      });
    } catch (error) {
      setResultModal({
        visible: true,
        success: false,
        message: error.message,
      });
    }
  }, [reload, t]);

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
      <ScrollView ref={scrollRef} style={styles.scrollView} showsVerticalScrollIndicator={false}>
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

        {/* PEA */}
        <Animated.View entering={FadeIn.delay(250).duration(400)} style={styles.section} onLayout={onPeaLayout}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('settings.peaSection')}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.infoBox, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="information-circle" size={20} color={theme.colors.primary} />
              <Text style={[styles.infoText, { color: theme.colors.text }]}>{t('settings.peaInfo')}</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('settings.peaOpenDate')}</Text>
            {settings.pea?.openDate ? (
              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <DateField
                    value={new Date(settings.pea.openDate)}
                    onChange={(d) => setPeaSettings({ openDate: d.toISOString() })}
                    label={t('settings.peaOpenDate')}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setPeaSettings({ openDate: null })}
                  style={styles.clearBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.clear')}
                >
                  <Ionicons name="close-circle" size={22} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary, { borderColor: theme.colors.border }]}
                onPress={() => setPeaSettings({ openDate: (pea?.openDate || new Date().toISOString()) })}
                accessibilityRole="button"
              >
                <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                <Text style={[styles.actionBtnTextSecondary, { color: theme.colors.text }]}>
                  {t('settings.peaSetOpenDate')}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.fieldHint, { color: theme.colors.textTertiary }]}>{t('settings.peaOpenDateHint')}</Text>

            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('settings.peaDeposits')}</Text>
            <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
              <TextInput
                value={depositsInput}
                onChangeText={setDepositsInput}
                onEndEditing={saveDeposits}
                onSubmitEditing={saveDeposits}
                placeholder={pea ? String(Math.round(pea.depositsEstimated ? pea.deposits : 0) || '') : ''}
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="decimal-pad"
                returnKeyType="done"
                style={[styles.input, { color: theme.colors.text }]}
                accessibilityLabel={t('settings.peaDeposits')}
              />
              <Text style={[styles.inputSuffix, { color: theme.colors.textTertiary }]}>{currencySymbol}</Text>
            </View>
            <Text style={[styles.fieldHint, { color: theme.colors.textTertiary }]}>
              {pea?.depositsEstimated && pea.deposits > 0
                ? t('settings.peaDepositsHintEstimated', { amount: formatAmount(pea.deposits, { decimals: 0 }) })
                : t('settings.peaDepositsHint')}
            </Text>
          </View>
        </Animated.View>

        {/* Mes enveloppes : chez qui */}
        <Animated.View entering={FadeIn.delay(255).duration(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('envelopes.section')}
          </Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {['PEA', 'CTO', 'CRYPTO'].map((acc, i) => {
              const inst = institutionById(accountInstitutions[acc]);
              return (
                <React.Fragment key={acc}>
                  {i > 0 && <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />}
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => setInstitutionPick(acc)}
                    accessibilityRole="button"
                    accessibilityLabel={t(`accounts.${acc}`)}
                  >
                    <View style={styles.settingLeft}>
                      {inst ? (
                        <AssetLogo institution={inst} size={40} />
                      ) : (
                        <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                          <Ionicons name="business-outline" size={18} color={theme.colors.primary} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t(`accounts.${acc}`)}</Text>
                        <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{inst ? inst.name : t('envelopes.none')}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
            <Text style={[styles.fieldHint, { color: theme.colors.textTertiary }]}>{t('envelopes.hint')}</Text>
          </View>
        </Animated.View>

        {/* Frais de courtage */}
        <Animated.View entering={FadeIn.delay(260).duration(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('broker.section')}
          </Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.infoBox, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="information-circle" size={20} color={theme.colors.primary} />
              <Text style={[styles.infoText, { color: theme.colors.text }]}>{t('broker.info')}</Text>
            </View>
            {['PEA', 'CTO', 'CRYPTO'].map((acc, i) => (
              <React.Fragment key={acc}>
                {i > 0 && <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />}
                <TouchableOpacity
                  style={styles.settingRow}
                  onPress={() => setBrokerPick(acc)}
                  accessibilityRole="button"
                  accessibilityLabel={t(`accounts.${acc}`)}
                >
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                      <Ionicons name="pricetag-outline" size={18} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t(`accounts.${acc}`)}</Text>
                      <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{brokerRuleText(brokerRules[acc])}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </React.Fragment>
            ))}
            <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTtf(!ttf);
              }}
              accessibilityRole="switch"
              accessibilityLabel={t('broker.ttfTitle')}
              accessibilityState={{ checked: ttf }}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="flag-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('broker.ttfTitle')}</Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{t('broker.ttfSub')}</Text>
                </View>
              </View>
              <Toggle value={ttf} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Tools Section */}
        <Animated.View entering={FadeIn.delay(275).duration(400)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
            {t('settings.tools')}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('Projection');
              }}
              accessibilityLabel={t('projection.title')}
              accessibilityRole="button"
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="trending-up" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>
                    {t('projection.title')}
                  </Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>
                    {t('projection.entrySubtitle')}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            {[
              { route: 'BankConnections', icon: 'link-outline', key: 'banks' },
              { route: 'Markets', icon: 'pulse-outline', key: 'markets' },
              { route: 'Wealth', icon: 'home-outline', key: 'wealth' },
              { route: 'HomeBuy', icon: 'calculator-outline', key: 'homeBuy' },
              { route: 'Profile', icon: 'compass-outline', key: 'profile' },
              { route: 'Budget', icon: 'git-network-outline', key: 'budget' },
              { route: 'Goals', icon: 'flag-outline', key: 'goals' },
              { route: 'Independence', icon: 'sunny-outline', key: 'independence' },
              { route: 'Benchmark', icon: 'git-compare-outline', key: 'benchmark' },
              { route: 'Rebalance', icon: 'pie-chart-outline', key: 'rebalance' },
              { route: 'Plans', icon: 'repeat-outline', key: 'plans' },
              { route: 'Fees', icon: 'receipt-outline', key: 'fees' },
              { route: 'Diversification', icon: 'globe-outline', key: 'diversification' },
            ].map((tool) => (
              <React.Fragment key={tool.route}>
                <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />
                <TouchableOpacity
                  style={styles.settingRow}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate(tool.route);
                  }}
                  accessibilityLabel={t(`${tool.key}.title`)}
                  accessibilityRole="button"
                >
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                      <Ionicons name={tool.icon} size={18} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t(`${tool.key}.title`)}</Text>
                      <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{t(`${tool.key}.entrySubtitle`)}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </React.Fragment>
            ))}

            <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('Tax');
              }}
              accessibilityLabel={t('tax.title')}
              accessibilityRole="button"
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text }]}>{t('tax.title')}</Text>
                  <Text style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}>{t('tax.entrySubtitle')}</Text>
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

      <OptionSheet
        visible={!!institutionPick}
        onClose={() => setInstitutionPick(null)}
        title={institutionPick ? t('envelopes.pickTitle', { account: t(`accounts.${institutionPick}`) }) : ''}
        options={[
          { key: null, label: t('envelopes.none') },
          // Tout, dans l'ordre utile : courtiers d'abord pour un PEA, plateformes pour la crypto.
          ...(institutionPick === 'CRYPTO' ? ['crypto', 'neobank', 'broker'] : ['broker', 'bank', 'neobank', 'insurer'])
            .flatMap((type) => searchInstitutions('', { types: [type], limit: 100 }))
            .map((i) => ({ key: i.id, label: i.name, left: <AssetLogo institution={i} size={24} /> })),
        ]}
        value={institutionPick ? accountInstitutions[institutionPick] || null : null}
        onSelect={(id) => {
          setAccountInstitution(institutionPick, id);
          setInstitutionPick(null);
        }}
      />

      <OptionSheet
        visible={!!brokerPick}
        onClose={() => setBrokerPick(null)}
        title={brokerPick ? t('broker.pickTitle', { account: t(`accounts.${brokerPick}`) }) : ''}
        message={t('broker.pickMessage')}
        options={brokerPick ? [
          { key: 'none', label: t('broker.rules.none') },
          // Les grilles connues, celle de l'établissement de l'enveloppe en tête.
          ...tariffsFor(brokerPick, accountInstitutions[brokerPick]).map((x) => ({
            key: `tariff:${x.id}`,
            label: tariffLabel(x),
            sub: tariffText(x),
            left: <AssetLogo institution={institutionById(x.institution)} size={24} />,
          })),
          { key: 'percent', label: t('broker.rules.percent') },
          { key: 'fixed', label: t('broker.rules.fixed') },
        ] : []}
        value={brokerPick ? (() => {
          const rule = normalizeRule(brokerRules[brokerPick]);
          return rule?.type === 'tariff' ? `tariff:${rule.id}` : rule?.type || 'none';
        })() : null}
        onSelect={(key) => {
          const acc = brokerPick;
          setBrokerPick(null);
          if (key.startsWith('tariff:')) setBrokerRule(acc, { type: 'tariff', id: tariffById(key.slice(7)).id });
          else if (key === 'percent' || key === 'fixed') setBrokerInput({ account: acc, type: key });
          else setBrokerRule(acc, { type: key });
        }}
      />

      <InputSheet
        visible={!!brokerInput}
        onClose={() => setBrokerInput(null)}
        title={brokerInput?.type === 'fixed' ? t('broker.rules.fixed') : t('broker.rules.percent')}
        fields={brokerInput?.type === 'fixed'
          ? [{ key: 'amount', label: t('broker.amount'), keyboardType: 'decimal-pad', suffix: currencySymbol }]
          : [
            { key: 'pct', label: t('broker.pct'), keyboardType: 'decimal-pad', suffix: '%' },
            { key: 'min', label: t('broker.min'), keyboardType: 'decimal-pad', suffix: currencySymbol },
          ]}
        confirmText={t('common.save')}
        onSubmit={(v) => {
          const num = (x) => Number(String(x ?? '').replace(',', '.').trim() || 0);
          if (brokerInput.type === 'fixed') {
            const amount = num(v.amount);
            if (!Number.isFinite(amount) || amount < 0) return t('broker.error');
            setBrokerRule(brokerInput.account, { type: 'fixed', amount });
          } else {
            const pct = num(v.pct);
            const min = num(v.min);
            if (!Number.isFinite(pct) || pct < 0 || pct > 5 || !Number.isFinite(min) || min < 0) return t('broker.error');
            setBrokerRule(brokerInput.account, { type: 'percent', pct, min });
          }
          setBrokerInput(null);
          return null;
        }}
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
        onClose={() => setResultModal({ ...resultModal, visible: false })}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  statsIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  infoBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  lastBackup: {
    marginBottom: 16,
  },
  lastBackupLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  lastBackupValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 10,
  },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtnTextSecondary: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  // flex: 1 : un sous-titre long passe à la ligne au lieu de pousser
  // l'interrupteur hors de la carte.
  settingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 12,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  settingDivider: {
    height: 1,
    marginLeft: 52,
  },
  dividerFull: {
    marginLeft: 0,
    marginTop: 16,
    marginBottom: 4,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  toggleDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  dangerBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  fieldHint: { fontSize: 12, lineHeight: 16, marginTop: 6, marginBottom: 14 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  input: { flex: 1, fontSize: 16, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 12 },
  inputSuffix: { fontSize: 14, fontWeight: '700' },
});

export default SettingsScreen;
