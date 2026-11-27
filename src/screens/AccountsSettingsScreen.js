/**
 * Comptes et courtiers : le PEA (date d'ouverture, versements), l'établissement
 * de chaque enveloppe et ses frais de courtage. Sorti des Réglages, qui
 * gardent l'app elle-même (langue, sécurité, sauvegarde).
 */

import React, { useCallback, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { InputSheet, OptionSheet } from '../components';
import Toggle from '../components/Toggle';
import DateField from '../components/Transaction/DateField';
import ScreenHeader from '../components/ScreenHeader';
import styles from '../components/Settings/settingsStyles';
import AssetLogo from '../components/AssetLogo';
import { institutionById, searchInstitutions } from '../core/institutions';
import { normalizeRule, tariffOf, tariffsFor, tariffById } from '../core/brokerFees';
import { tariffLabel } from '../constants/brokerTariffs';
import { formatDate, formatPercent } from '../utils/formatters';
import { normalizeNumber } from '../utils/parseNumber';

const AccountsSettingsScreen = ({ navigation }) => {
  const theme = useTheme();
  const { pea } = usePortfolio();
  const { t, currencySymbol, formatAmount, locale, settings, setPeaSettings } = useSettings();
  const { brokerRules, setBrokerRule, ttf, setTtf, accountInstitutions, setAccountInstitution } = usePlanning();

  // Frais de courtage : enveloppe dont on choisit la règle, puis saisie d'un pourcentage ou d'un montant.
  const [brokerPick, setBrokerPick] = useState(null);
  const [brokerInput, setBrokerInput] = useState(null); // { account, type }
  // Établissement d'une enveloppe (PEA chez Bourse Direct…).
  const [institutionPick, setInstitutionPick] = useState(null);
  const [depositsInput, setDepositsInput] = useState(
    settings.pea?.depositsOverride > 0 ? String(settings.pea.depositsOverride) : '',
  );

  const saveDeposits = useCallback(() => {
    const n = Number(normalizeNumber(depositsInput));
    setPeaSettings({ depositsOverride: n > 0 ? n : null });
    if (!(n > 0)) setDepositsInput('');
  }, [depositsInput, setPeaSettings]);

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <ScreenHeader
            title={t('accountsSettings.title')}
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

        {/* PEA */}
        <Animated.View entering={FadeIn.delay(250).duration(400)} style={styles.section}>
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

        <View style={{ height: 40 }} />
      </ScrollView>

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
          const num = (x) => Number(normalizeNumber(x ?? '') || 0);
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
    </SafeAreaView>
  );
};

export default AccountsSettingsScreen;
