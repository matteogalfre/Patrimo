/**
 * Saisie d'une opération : achat, vente ou dividende.
 *
 * Le même écran sert d'onglet « Ajouter » et, empilé, à modifier une
 * opération existante ou à en ajouter une depuis la fiche d'un actif.
 *
 * Le prix est pré-rempli avec le cours de clôture du jour choisi, mais reste
 * modifiable : c'est le prix réellement payé qui fait le prix de revient. Il
 * peut être saisi dans la devise de cotation ou dans la devise de référence
 * (une crypto achetée en euros, par exemple). Laissé vide, il sera complété
 * plus tard depuis l'historique des cours.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { ResultModal } from '../components';
import AssetSearchModal from '../components/Transaction/AssetSearchModal';
import DateField from '../components/Transaction/DateField';
import { marketData } from '../services/marketData';
import { expectedDividend } from '../core/income';
import { flatTaxRate } from '../core/taxRates';
import { fxService } from '../services/fxService';
import { createFxConverter } from '../core/fx';
import { ACCOUNTS, ASSET_TYPES, accountsForType } from '../core/assets';
import AccountInstitution from '../components/Portfolio/AccountInstitution';
import { DUST } from '../core/engine';
import { quantityForAmount } from '../core/plans';
import { estimateFees, normalizeRule, tariffOf } from '../core/brokerFees';
import { looksLikeFund } from '../core/fees';
import { tariffLabel } from '../constants/brokerTariffs';
import AssetLogo from '../components/AssetLogo';
import SegmentedControl from '../components/SegmentedControl';
import { formatDate, formatDateKey, formatPercent, formatQuantity } from '../utils/formatters';
import { normalizeNumber } from '../utils/parseNumber';

const parseNum = (s) => {
  const str = normalizeNumber(s ?? '');
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : NaN;
};

/** Valeur numérique → texte de champ, avec le séparateur décimal de la langue. */
const toInput = (n, locale) => {
  if (!(n > 0)) return '';
  return n.toLocaleString(locale, { maximumSignificantDigits: 8, useGrouping: false });
};

const assetFromRecord = (r) => ({ assetId: r.assetId, assetType: r.assetType || ASSET_TYPES.STOCK, symbol: r.symbol, name: r.name || r.symbol });

/** Cours suggéré arrondi comme chez un courtier ; les très petits cours gardent leurs décimales. */
const roundSuggestion = (p) => {
  if (p >= 1) return Math.round(p * 100) / 100;
  if (p >= 0.01) return Math.round(p * 10000) / 10000;
  return Number(p.toPrecision(4));
};

/** Midi pour une date passée : aucun décalage de fuseau ne la fait changer de jour. */
const toStoredDate = (d) => {
  const out = new Date(d);
  if (formatDateKey(out) !== formatDateKey(new Date())) out.setHours(12, 0, 0, 0);
  return out.toISOString();
};

const AddTransactionScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { t, locale, currency: base, formatPrice, formatAmount } = useSettings();
  const {
    assets,
    transactions,
    dividends,
    quotes,
    addTransaction,
    updateTransaction,
    addDividend,
    updateDividend,
    getHeldQuantity,
  } = usePortfolio();

  const { handlePlan, brokerRules, ttf: ttfEnabled, accountInstitutions } = usePlanning();
  const params = route?.params || {};
  const isStacked = route?.name === 'TransactionForm';
  const editingTx = params.transactionId ? transactions.find((x) => x.id === params.transactionId) : null;
  const editingDiv = params.dividendId ? dividends.find((x) => x.id === params.dividendId) : null;
  const isEdit = !!(editingTx || editingDiv);

  const [mode, setMode] = useState(params.mode || 'buy');
  const [asset, setAsset] = useState(params.asset || null);
  const [account, setAccount] = useState(params.account || null);
  const [date, setDate] = useState(() => (params.date ? new Date(params.date) : new Date()));
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [priceCurrency, setPriceCurrency] = useState(null);
  const [fees, setFees] = useState('');
  // Dividende attendu : montant pré-rempli, modifiable.
  const [amount, setAmount] = useState(() => (params.dividendAmount > 0 ? toInput(params.dividendAmount, locale) : ''));
  const [divCurrency, setDivCurrency] = useState(base);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState({ visible: false, success: true, message: '' });
  const [prefill, setPrefill] = useState({ loading: false, price: null, currency: null });
  const [rateToBase, setRateToBase] = useState(null);
  const priceTouched = useRef(false);
  const qtyTouched = useRef(false);
  const feesTouched = useRef(false);

  // Pré-remplissage en mode modification (une seule fois).
  const loadedEdit = useRef(false);
  useEffect(() => {
    if (loadedEdit.current) return;
    if (editingTx) {
      loadedEdit.current = true;
      priceTouched.current = true;
      setMode(editingTx.side);
      setAsset(assetFromRecord(editingTx));
      setAccount(editingTx.account);
      setDate(new Date(editingTx.date));
      setQuantity(toInput(editingTx.quantity, locale));
      setPrice(toInput(editingTx.unitPrice, locale));
      setPriceCurrency(editingTx.currency);
      setFees(toInput(editingTx.fees, locale));
      feesTouched.current = true;
      setNotes(editingTx.notes || '');
    } else if (editingDiv) {
      loadedEdit.current = true;
      setMode('dividend');
      setAsset(editingDiv.assetId ? assetFromRecord({ ...editingDiv, assetType: ASSET_TYPES.STOCK }) : null);
      setAccount(editingDiv.account);
      setDate(new Date(editingDiv.date));
      setAmount(toInput(editingDiv.amount, locale));
      setDivCurrency(editingDiv.currency);
      setNotes(editingDiv.notes || '');
    }
  }, [editingTx, editingDiv, locale]);

  const isDividend = mode === 'dividend';
  const dateKey = formatDateKey(date);

  const allowedAccounts = useMemo(() => {
    if (isDividend) return [ACCOUNTS.PEA, ACCOUNTS.CTO];
    return asset ? accountsForType(asset.assetType) : [];
  }, [asset, isDividend]);
  // Tes enveloppes : celles dont tu as indiqué l'établissement (PEA chez
  // Bourse Direct…) ou qui ont déjà des opérations. Les autres restent à un
  // toucher (« Autre enveloppe »), pour une première opération ailleurs.
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const ownedAccounts = useMemo(() => {
    const used = new Set(transactions.map((x) => x.account));
    return allowedAccounts.filter((acc) => accountInstitutions?.[acc] || used.has(acc));
  }, [allowedAccounts, accountInstitutions, transactions]);
  const accountOptions = useMemo(() => {
    if (showAllAccounts || isEdit || !ownedAccounts.length) return allowedAccounts;
    return allowedAccounts.filter((acc) => ownedAccounts.includes(acc) || acc === account);
  }, [allowedAccounts, ownedAccounts, showAllAccounts, isEdit, account]);
  const hiddenAccounts = allowedAccounts.filter((acc) => !accountOptions.includes(acc));

  // Enveloppe par défaut : celle où l'actif est déjà détenu, sinon la
  // dernière utilisée pour ce type d'actif.
  useEffect(() => {
    if (!asset || isEdit || (account && accountOptions.includes(account))) return;
    const held = assets.find((a) => a.assetId === asset.assetId && a.isHeld);
    const fromHeld = held?.accounts?.find((acc) => accountOptions.includes(acc));
    const last = [...transactions]
      .filter((x) => x.assetType === asset.assetType && accountOptions.includes(x.account))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.account;
    setAccount(fromHeld || last || accountOptions[0] || null);
  }, [asset, accountOptions, account, assets, transactions, isEdit]);

  // Dividende : le montant attendu d'après le dividende annoncé (Yahoo) et
  // tes parts la veille du détachement. Pré-rempli tant que tu n'as rien tapé.
  const [divEvents, setDivEvents] = useState({ currency: null, events: [] });
  const amountTouched = useRef(false);
  useEffect(() => {
    if (!isDividend || !asset) return undefined;
    let alive = true;
    marketData.getDividendEvents(asset).then((r) => alive && setDivEvents(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [isDividend, asset]);
  const expected = useMemo(() => {
    if (!isDividend || !asset || !account || !divEvents.events.length) return null;
    return expectedDividend({
      events: divEvents.events,
      date,
      account,
      symbol: asset.symbol,
      sharesAt: (key) => getHeldQuantity(asset.assetId, account, new Date(`${key}T23:59:59`)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDividend, asset, account, divEvents, dateKey, getHeldQuantity]);

  // Cours de clôture du jour choisi.
  useEffect(() => {
    if (!asset || isDividend) return undefined;
    let alive = true;
    setPrefill((p) => ({ ...p, loading: true }));
    marketData
      .getPriceAt(asset, date)
      .catch(() => null)
      .then((hit) => {
        if (alive) setPrefill({ loading: false, price: hit?.price ?? null, currency: hit?.currency ?? null });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.assetId, dateKey, isDividend]);

  const assetCurrency = prefill.currency
    || (asset && quotes[asset.assetId]?.currency)
    || (editingTx?.currency)
    || (asset?.assetType === ASSET_TYPES.CRYPTO ? 'USD' : null);
  const effectiveCurrency = priceCurrency || assetCurrency || base;
  const expectedCurrency = divEvents.currency || assetCurrency || base;
  const expectedValue = expected ? expected.net ?? expected.gross : null;
  const divOptions = [...new Set([base, assetCurrency, divEvents.currency].filter(Boolean))];
  useEffect(() => {
    if (!expected || isEdit || amountTouched.current || !divOptions.includes(expectedCurrency)) return;
    setDivCurrency(expectedCurrency);
    setAmount(toInput(expectedValue, locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expected?.exDate, expectedValue, expectedCurrency]);
  const currencyOptions = [...new Set([assetCurrency, base].filter(Boolean))];

  // Taux devise de cotation → devise de référence, au jour de l'opération.
  useEffect(() => {
    if (!assetCurrency || assetCurrency === base) {
      setRateToBase(1);
      return undefined;
    }
    let alive = true;
    fxService
      .loadRates(base, [assetCurrency], date)
      .then((rates) => {
        if (alive) setRateToBase(createFxConverter({ base, ...rates }).at(assetCurrency, date));
      })
      .catch(() => alive && setRateToBase(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetCurrency, base, dateKey]);

  const suggestedPrice = useMemo(() => {
    if (!(prefill.price > 0)) return null;
    if (effectiveCurrency === prefill.currency) return prefill.price;
    if (effectiveCurrency === base && rateToBase > 0) return prefill.price * rateToBase;
    return null;
  }, [prefill, effectiveCurrency, base, rateToBase]);

  useEffect(() => {
    if (!priceTouched.current && suggestedPrice) setPrice(toInput(roundSuggestion(suggestedPrice), locale));
  }, [suggestedPrice, locale]);

  const qtyNum = parseNum(quantity);
  const priceNum = parseNum(price);

  // Achat programmé : la quantité suit le montant prévu (en devise de
  // référence) et le prix, tant que l'utilisateur ne la modifie pas lui-même.
  useEffect(() => {
    if (qtyTouched.current || isEdit || !(params.amount > 0) || !(priceNum > 0) || !asset) return;
    const budget = effectiveCurrency === base ? params.amount : rateToBase > 0 ? params.amount / rateToBase : null;
    const q = quantityForAmount({ amount: budget, price: priceNum, assetType: asset.assetType });
    if (q > 0) setQuantity(toInput(q, locale));
  }, [params.amount, priceNum, effectiveCurrency, base, rateToBase, asset, isEdit, locale]);
  const feesNum = parseNum(fees) || 0;

  // Frais estimés selon la règle de l'enveloppe, tant que l'utilisateur ne les a pas saisis.
  const feeEstimate = useMemo(() => {
    if (isDividend || !asset || !account || !(qtyNum > 0) || !(priceNum > 0)) return null;
    return estimateFees({
      rule: brokerRules?.[account],
      amount: qtyNum * priceNum,
      side: mode,
      symbol: asset.symbol,
      assetType: asset.assetType,
      date,
      currency: effectiveCurrency,
      account,
      ttf: ttfEnabled,
      // Un achat programmé suit le barème des plans quand le courtier en a un.
      plan: !!params.planId,
      fund: looksLikeFund(asset),
    });
  }, [isDividend, asset, account, qtyNum, priceNum, brokerRules, mode, date, effectiveCurrency, ttfEnabled, params.planId]);
  useEffect(() => {
    if (!feesTouched.current && feeEstimate) setFees(toInput(feeEstimate.total, locale));
  }, [feeEstimate, locale]);
  const ruleLabel = (stored) => {
    const rule = normalizeRule(stored);
    if (!rule) return '';
    const tariff = tariffOf(rule);
    return tariff ? tariffLabel(tariff) : t(`broker.rules.${rule.type}`);
  };
  const feesHint = [
    feeEstimate && !feesTouched.current
      ? t('transaction.feesEstimated', {
        rule: ruleLabel(brokerRules?.[account]),
        ttf: feeEstimate.ttf > 0 ? t('transaction.feesTtf', { amount: formatPrice(feeEstimate.ttf, effectiveCurrency) }) : '',
      })
      : null,
    t('transaction.feesHelp'),
  ].filter(Boolean).join(' ');
  const total = qtyNum > 0 && priceNum > 0 ? qtyNum * priceNum + (mode === 'sell' ? -feesNum : feesNum) : null;
  const totalInBase = total == null
    ? null
    : effectiveCurrency === base
      ? total
      : effectiveCurrency === assetCurrency && rateToBase > 0 ? total * rateToBase : null;

  const available = useMemo(() => {
    if (mode !== 'sell' || !asset || !account) return null;
    return getHeldQuantity(asset.assetId, account, date, editingTx?.id);
  }, [mode, asset, account, date, editingTx, getHeldQuantity]);

  const selectAsset = useCallback((a) => {
    setSearchOpen(false);
    setAsset(a);
    setAccount(null);
    setPriceCurrency(null);
    setPrice('');
    priceTouched.current = false;
    setErrors({});
  }, []);

  const resetForm = useCallback(() => {
    setAsset(null);
    setAccount(null);
    setQuantity('');
    setPrice('');
    setPriceCurrency(null);
    setFees('');
    feesTouched.current = false;
    setAmount('');
    setNotes('');
    setErrors({});
    setDate(new Date());
    priceTouched.current = false;
  }, []);

  const validate = () => {
    const e = {};
    if (!asset) e.asset = t('transaction.errors.asset');
    if (!account) e.account = t('transaction.errors.account');
    if (isDividend) {
      const a = parseNum(amount);
      if (!(a > 0)) e.amount = t('transaction.errors.amount');
    } else {
      if (!(qtyNum > 0)) e.quantity = t('transaction.errors.quantity');
      if (Number.isNaN(priceNum) || (priceNum !== null && priceNum <= 0)) e.price = t('transaction.errors.price');
      if (Number.isNaN(parseNum(fees)) || parseNum(fees) < 0) e.fees = t('transaction.errors.fees');
      if (mode === 'sell' && available != null && qtyNum > available + DUST) {
        e.quantity = t('transaction.errors.oversell', {
          available: formatQuantity(Math.max(0, available), asset?.assetType, locale),
        });
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (submitting || !validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSubmitting(true);
    try {
      if (isDividend) {
        const input = {
          symbol: asset.symbol,
          name: asset.name,
          account,
          amount: parseNum(amount),
          currency: divCurrency,
          date: toStoredDate(date),
          notes: notes.trim() || null,
        };
        if (editingDiv) await updateDividend(editingDiv.id, input);
        else await addDividend(input);
      } else {
        const fromMarket = !priceTouched.current && suggestedPrice > 0 && priceNum === roundSuggestion(suggestedPrice);
        const input = {
          assetType: asset.assetType,
          symbol: asset.symbol,
          name: asset.name,
          account,
          side: mode,
          quantity: qtyNum,
          unitPrice: priceNum > 0 ? priceNum : null,
          fees: feesNum,
          currency: effectiveCurrency,
          date: toStoredDate(date),
          notes: notes.trim() || null,
          priceSource: fromMarket ? 'market' : 'user',
        };
        if (editingTx) await updateTransaction(editingTx.id, input);
        else await addTransaction(input);
        if (params.planId && !editingTx) handlePlan(params.planId);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isStacked) {
        navigation.goBack();
        return;
      }
      setResult({ visible: true, success: true, message: t('transaction.saved') });
    } catch (err) {
      setResult({ visible: true, success: false, message: `${t('transaction.saveError')} (${err.message})` });
    } finally {
      setSubmitting(false);
    }
  };

  // Un seul accent pour l'action principale, quel que soit le type d'opération.
  const modeColor = theme.colors.primary;
  const onModeColor = theme.colors.onPrimary;

  const renderField = (key, label, value, onChange, { suffix, placeholder, hint, onEdit } = {}) => (
    <View style={styles.section}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: theme.colors.surface, borderColor: errors[key] ? theme.colors.error : theme.colors.border },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={(v) => {
            onEdit?.();
            onChange(v);
            if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
          }}
          placeholder={placeholder || '0'}
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="decimal-pad"
          style={[styles.input, { color: theme.colors.text }]}
          accessibilityLabel={label}
        />
        {suffix}
      </View>
      {!!errors[key] && <Text style={[styles.error, { color: theme.colors.error }]}>{errors[key]}</Text>}
      {!errors[key] && !!hint && <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{hint}</Text>}
    </View>
  );

  const currencySwitch = (options, current, onPick) => (
    <View style={styles.currencySwitch}>
      {options.map((c) => {
        const active = c === current;
        return (
          <TouchableOpacity
            key={c}
            onPress={() => onPick(c)}
            disabled={options.length < 2}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.currencyBtn, active && { backgroundColor: theme.colors.primaryMuted }]}
          >
            <Text style={[styles.currencyText, { color: active ? theme.colors.primary : theme.colors.textTertiary }]}>{c}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const priceHint = prefill.loading
    ? t('transaction.priceLoading')
    : prefill.price > 0
      ? t('transaction.priceClose', { price: formatPrice(prefill.price, prefill.currency) })
      : asset ? t('transaction.priceEmpty') : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            {isStacked && (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                style={styles.back}
              >
                <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
              </TouchableOpacity>
            )}
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {isEdit ? t('transaction.editTitle') : t('transaction.title')}
            </Text>
          </View>

          {/* Les livrets et comptes n'ont pas d'opérations : un raccourci vers leur saisie. */}
          {!isEdit && (
            <TouchableOpacity
              style={[styles.cashLink, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              onPress={() => navigation.navigate('CashAccount')}
              accessibilityRole="button"
            >
              <Ionicons name="leaf-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={[styles.cashLinkText, { color: theme.colors.textSecondary }]}>{t('cash.addLink')}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}

          {/* Type d'opération */}
          {!isEdit && (
            <View style={styles.section}>
              <SegmentedControl
                options={['buy', 'sell', 'dividend'].map((m) => ({ key: m, label: t(`transaction.modes.${m}`) }))}
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setErrors({});
                  if (m === 'dividend' && asset?.assetType === ASSET_TYPES.CRYPTO) setAsset(null);
                }}
                variant="track"
                fill
              />
            </View>
          )}

          {/* Actif */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.colors.text }]}>{t('transaction.asset')}</Text>
            <TouchableOpacity
              style={[
                styles.assetBtn,
                { backgroundColor: theme.colors.surface, borderColor: errors.asset ? theme.colors.error : theme.colors.border },
              ]}
              onPress={() => !isEdit && setSearchOpen(true)}
              disabled={isEdit}
              accessibilityRole="button"
              accessibilityLabel={asset ? `${asset.name} ${asset.symbol}` : t('transaction.chooseAsset')}
            >
              {asset ? (
                <>
                  <AssetLogo assetId={asset.assetId} symbol={asset.symbol} />
                  <View style={styles.assetInfo}>
                    <Text style={[styles.assetName, { color: theme.colors.text }]} numberOfLines={1}>{asset.name}</Text>
                    <Text style={[styles.assetSymbol, { color: theme.colors.textTertiary }]}>{asset.symbol}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Ionicons name="search" size={20} color={theme.colors.primary} />
                  <Text style={[styles.assetPlaceholder, { color: theme.colors.textSecondary }]}>
                    {isDividend ? t('transaction.chooseStock') : t('transaction.chooseAsset')}
                  </Text>
                </>
              )}
              {!isEdit && <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />}
            </TouchableOpacity>
            {!!errors.asset && <Text style={[styles.error, { color: theme.colors.error }]}>{errors.asset}</Text>}
          </View>

          {/* Enveloppe : les tiennes d'abord, avec leur établissement */}
          {!!asset && (accountOptions.length > 1 || hiddenAccounts.length > 0 || !!accountInstitutions?.[account]) && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.colors.text }]}>{t('transaction.account')}</Text>
              <View style={styles.chips}>
                {accountOptions.map((acc) => {
                  const active = account === acc;
                  return (
                    <TouchableOpacity
                      key={acc}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setAccount(acc);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <View style={styles.accountChip}>
                        <Text style={[styles.chipText, { color: active ? theme.colors.primary : theme.colors.textSecondary }]}>
                          {t(`accounts.${acc}`)}
                        </Text>
                        <AccountInstitution account={acc} size={16} showName={false} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {hiddenAccounts.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      setShowAllAccounts(true);
                    }}
                    accessibilityRole="button"
                    style={[styles.chip, { borderStyle: 'dashed', borderColor: theme.colors.border }]}
                  >
                    <Text style={[styles.chipText, { color: theme.colors.textTertiary }]}>{t('transaction.otherAccount')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* Le nom complet de la banque, sous les boutons : dedans, il débordait. */}
              {!!accountInstitutions?.[account] && (
                <View style={styles.accountBank}>
                  <AccountInstitution account={account} size={14} />
                </View>
              )}
              {!!errors.account && <Text style={[styles.error, { color: theme.colors.error }]}>{errors.account}</Text>}
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.colors.text }]}>{t('transaction.date')}</Text>
            <DateField value={date} onChange={setDate} label={t('transaction.date')} />
          </View>

          {isDividend ? (
            <>
              {renderField('amount', t('transaction.dividendAmount'), amount, (v) => {
                amountTouched.current = true;
                setAmount(v);
              }, {
                suffix: currencySwitch(divOptions, divCurrency, setDivCurrency),
                hint: t('transaction.dividendHint'),
              })}
              {!!expected && (
                <View style={[styles.expected, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="calculator-outline" size={16} color={theme.colors.primary} />
                  <View style={styles.expectedBody}>
                    <Text style={[styles.expectedText, { color: theme.colors.text }]}>
                      {t('transaction.dividendExpected', {
                        count: expected.shares,
                        date: formatDate(expected.exDate, { locale }),
                        shares: formatQuantity(expected.shares, asset?.assetType, locale),
                        perShare: formatPrice(expected.perShare, expectedCurrency),
                        gross: formatPrice(expected.gross, expectedCurrency),
                      })}
                      {' '}
                      {expected.net == null
                        ? t('transaction.dividendForeign')
                        : account === ACCOUNTS.PEA
                          ? t('transaction.dividendNetPea')
                          : t('transaction.dividendNetCto', {
                            net: formatPrice(expected.net, expectedCurrency),
                            rate: formatPercent(flatTaxRate(date.getFullYear()), { showSign: false, decimals: 1 }),
                          })}
                    </Text>
                    {divOptions.includes(expectedCurrency) && (parseNum(amount) !== Math.round(expectedValue * 100) / 100 || divCurrency !== expectedCurrency) && (
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.selectionAsync();
                          setDivCurrency(expectedCurrency);
                          setAmount(toInput(expectedValue, locale));
                        }}
                        accessibilityRole="button"
                        style={styles.expectedUse}
                      >
                        <Text style={[styles.expectedUseText, { color: theme.colors.primary }]}>
                          {t('transaction.dividendUse', { amount: formatPrice(expectedValue, expectedCurrency) })}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              {renderField('quantity', t('transaction.quantity'), quantity, setQuantity, {
                onEdit: () => {
                  qtyTouched.current = true;
                },
                hint: available != null
                  ? t('transaction.available', { quantity: formatQuantity(Math.max(0, available), asset?.assetType, locale) })
                  : null,
                suffix: available > 0 ? (
                  <TouchableOpacity
                    onPress={() => setQuantity(toInput(available, locale))}
                    style={styles.maxBtn}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.maxText, { color: theme.colors.primary }]}>{t('transaction.max')}</Text>
                  </TouchableOpacity>
                ) : null,
              })}

              {renderField('price', t('transaction.unitPrice'), price, setPrice, {
                onEdit: () => { priceTouched.current = true; },
                suffix: (
                  <>
                    {prefill.loading && <ActivityIndicator size="small" color={theme.colors.primary} />}
                    {currencySwitch(currencyOptions.length ? currencyOptions : [base], effectiveCurrency, (c) => {
                      setPriceCurrency(c);
                      priceTouched.current = false;
                    })}
                  </>
                ),
                hint: priceHint,
              })}

              {renderField('fees', t('transaction.fees'), fees, setFees, {
                placeholder: t('transaction.feesPlaceholder'),
                hint: feesHint,
                onEdit: () => {
                  feesTouched.current = true;
                },
                suffix: <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{effectiveCurrency}</Text>,
              })}

              {total != null && (
                <View style={[styles.totalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.totalLabel, { color: theme.colors.textSecondary }]}>
                    {mode === 'sell' ? t('transaction.totalSell') : t('transaction.totalBuy')}
                  </Text>
                  <Text style={[styles.totalValue, { color: theme.colors.text }]}>{formatPrice(total, effectiveCurrency)}</Text>
                  {effectiveCurrency !== base && totalInBase != null && (
                    <Text style={[styles.totalSub, { color: theme.colors.textTertiary }]}>
                      ≈ {formatAmount(totalInBase)} {t('transaction.atRateOfDay')}
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.colors.text }]}>{t('transaction.notes')}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('transaction.notesPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              style={[styles.notes, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              multiline
              maxLength={500}
            />
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.submit, { backgroundColor: modeColor }, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={onModeColor} />
              ) : (
                <Text style={[styles.submitText, { color: onModeColor }]}>
                  {isEdit ? t('common.save') : t(`transaction.submit.${mode}`)}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AssetSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={selectAsset}
        ownedAssets={assets.filter((a) => a.isHeld || isDividend)}
        stocksOnly={isDividend}
      />

      <ResultModal
        visible={result.visible}
        onClose={() => setResult((r) => ({ ...r, visible: false }))}
        success={result.success}
        message={result.message}
        primaryButtonText={result.success ? t('transaction.goToPortfolio') : t('common.ok')}
        secondaryButtonText={result.success ? t('transaction.addAnother') : undefined}
        onPrimaryPress={() => {
          setResult((r) => ({ ...r, visible: false }));
          if (result.success) {
            resetForm();
            navigation.navigate('Portfolio');
          }
        }}
        onSecondaryPress={() => {
          setResult((r) => ({ ...r, visible: false }));
          resetForm();
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  expected: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 12, marginTop: -6, marginBottom: 16 },
  expectedBody: { flex: 1 },
  expectedText: { fontSize: 13, lineHeight: 19 },
  expectedUse: { minHeight: 32, justifyContent: 'center', marginTop: 4 },
  expectedUseText: { fontSize: 14, fontWeight: '700' },
  accountChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  accountBank: { marginTop: 8, marginLeft: 2 },
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 4 },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center', marginLeft: -10 },
  headerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  section: { paddingHorizontal: 20, marginBottom: 18 },
  cashLink: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 18, paddingHorizontal: 14, minHeight: 48, borderRadius: 12, borderWidth: 1 },
  cashLinkText: { flex: 1, fontSize: 13, fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  assetBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, minHeight: 60 },
  assetInfo: { flex: 1 },
  assetName: { fontSize: 15, fontWeight: '700' },
  assetSymbol: { fontSize: 12, marginTop: 2 },
  assetPlaceholder: { flex: 1, fontSize: 15, fontWeight: '500' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingRight: 8, gap: 6 },
  input: { flex: 1, fontSize: 20, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 14 },
  suffix: { fontSize: 13, fontWeight: '700', paddingHorizontal: 8 },
  currencySwitch: { flexDirection: 'row', gap: 2 },
  currencyBtn: { minHeight: 36, minWidth: 44, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  currencyText: { fontSize: 13, fontWeight: '700' },
  maxBtn: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' },
  maxText: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  error: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  totalCard: { marginHorizontal: 20, marginBottom: 18, borderRadius: 14, borderWidth: 1, padding: 14 },
  totalLabel: { fontSize: 12, fontWeight: '600' },
  totalValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  totalSub: { fontSize: 12, marginTop: 2 },
  notes: { borderRadius: 14, borderWidth: 1, padding: 14, minHeight: 72, fontSize: 14, textAlignVertical: 'top' },
  submit: { minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 16, fontWeight: '800' },
});

export default AddTransactionScreen;
