/**
 * Mon profil : un questionnaire court (une question par écran, réponse d'un
 * toucher), un profil d'investisseur parmi cinq, et un plan d'action
 * calculé sur le patrimoine réel. Tout reste sur le téléphone.
 *
 * Des repères généraux, pas un conseil personnalisé : aucun produit n'est
 * recommandé (voir core/profile).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import Slider from '../components/Slider';
import { ACCOUNTS } from '../core/assets';
import { INVESTED_KINDS } from '../core/cash';
import { computeExposure } from '../core/exposure';
import { brokerageFees, computeFees, effectiveTers } from '../core/fees';
import { buildPlan, profileTargets, PROFILES, scoreProfile, STOCK_SHARE, visibleQuestions } from '../core/profile';
import { formatDate, formatPercent } from '../utils/formatters';
import { useMyNumbers } from '../hooks/useMyNumbers';

const OPTION_ICONS = {
  work: { stable: 'shield-checkmark-outline', contract: 'hourglass-outline', freelance: 'rocket-outline', student: 'school-outline', retired: 'sunny-outline', jobless: 'search-outline' },
  household: { single: 'person-outline', couple: 'people-outline', coupleKids: 'people-circle-outline', singleKids: 'happy-outline' },
  debts: { none: 'checkmark-circle-outline', mortgage: 'home-outline', consumer: 'car-outline', revolving: 'card-outline', student: 'school-outline' },
  debtRate: { low: 'trending-down-outline', mid: 'remove-outline', high: 'trending-up-outline', unknown: 'help-outline' },
  projects: { none: 'leaf-outline', home: 'home-outline', car: 'car-sport-outline', bigSpend: 'airplane-outline' },
  homeWhen: { soon: 'time-outline', later: 'calendar-outline' },
  goal: { safety: 'umbrella-outline', project: 'flag-outline', growth: 'trending-up-outline', retirement: 'sunny-outline', income: 'cash-outline' },
  drop: { sellAll: 'exit-outline', sellSome: 'cut-outline', wait: 'cafe-outline', buyMore: 'cart-outline' },
  blocker: { fear: 'alert-circle-outline', lost: 'map-outline', time: 'time-outline', none: 'thumbs-up-outline' },
  experience: { never: 'egg-outline', savings: 'wallet-outline', funds: 'stats-chart-outline', expert: 'trophy-outline' },
  crypto: { no: 'close-circle-outline', little: 'eye-outline', believer: 'logo-bitcoin' },
  tax: { 0: 'document-text-outline', 11: 'document-text-outline', 30: 'document-text-outline', 41: 'document-text-outline', unknown: 'help-outline' },
};

const STATUS_ICONS = { todo: null, warning: 'alert-circle', info: 'bulb-outline', done: 'checkmark-circle' };
const THINKING_MS = 1200;

/** Une réponse : une carte qui s'enfonce un peu sous le doigt. */
const AnswerCard = ({ icon, label, selected, onPress, theme, multi }) => {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPressIn={() => {
        scale.value = withTiming(0.97, { duration: 80 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 220 });
      }}
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
    >
      <Animated.View
        style={[
          styles.answer,
          { backgroundColor: selected ? theme.colors.primaryMuted : theme.colors.surface, borderColor: selected ? theme.colors.primary : theme.colors.border },
          style,
        ]}
      >
        <View style={[styles.answerIcon, { backgroundColor: selected ? theme.colors.primary : theme.colors.backgroundSecondary }]}>
          <Ionicons name={icon} size={20} color={selected ? theme.colors.onPrimary : theme.colors.textSecondary} />
        </View>
        <Text style={[styles.answerText, { color: theme.colors.text }]}>{label}</Text>
        {selected && (
          <Animated.View entering={ZoomIn.duration(180)}>
            <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
};

const ProfileScreen = ({ navigation, route }) => {
  // Première ouverture de l'app : un accueil avant le questionnaire, qu'on peut passer.
  const onboarding = !!route?.params?.onboarding;
  const theme = useTheme();
  const { t, locale, formatAmount } = useSettings();
  const { profile, setProfile, setTargets, fees, exposure: overrides, setOnboarded } = usePlanning();
  const numbers = useMyNumbers();
  const { cash, totals, overview, pea, assets, transactions, fx, setDemo } = usePortfolio();

  const [mode, setMode] = useState(profile ? 'result' : 'intro');
  const [answers, setAnswers] = useState(() => profile?.answers || {
    age: 30,
    // Ce que l'app sait déjà (budget, objectifs) pré-remplit les réponses.
    income: Math.round((numbers.income || 2500) / 100) * 100,
    expenses: Math.round((numbers.expenses || 1500) / 50) * 50,
    // Déjà des opérations dans l'app : l'expérience se devine.
    experience: transactions.length ? 'funds' : undefined,
  });
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const advancing = useRef(false);

  const questions = visibleQuestions(answers);
  const q = questions[Math.min(step, questions.length - 1)];

  // Barre de progression qui glisse d'une question à l'autre.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming((step + 1) / questions.length, { duration: 300 });
  }, [step, questions.length, progress]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // Pendant le calcul, l'icône respire.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (mode !== 'thinking') return;
    pulse.value = withRepeat(withSequence(withTiming(1.15, { duration: 400 }), withTiming(1, { duration: 400 })), -1);
  }, [mode, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const finish = (final) => {
    setMode('thinking');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      setProfile(final);
      setMode('result');
    }, THINKING_MS);
  };

  const next = (final = answers) => {
    const list = visibleQuestions(final);
    const i = list.findIndex((x) => x.id === q.id);
    if (i < list.length - 1) {
      setDir(1);
      setStep(i + 1);
    } else {
      finish(final);
    }
    advancing.current = false;
  };

  const back = () => {
    if (step === 0) {
      setMode(profile ? 'result' : 'intro');
      return;
    }
    Haptics.selectionAsync();
    setDir(-1);
    setStep(step - 1);
  };

  // Un choix unique fait passer à la suite, après un court temps pour voir la coche.
  const choose = (value) => {
    if (advancing.current) return;
    advancing.current = true;
    Haptics.selectionAsync();
    const final = { ...answers, [q.id]: value };
    setAnswers(final);
    setTimeout(() => next(final), 260);
  };

  const toggle = (value) => {
    Haptics.selectionAsync();
    const current = answers[q.id] || [];
    let list;
    if (value === q.exclusive) list = current.includes(value) ? [] : [value];
    else list = current.includes(value) ? current.filter((v) => v !== value) : [...current.filter((v) => v !== q.exclusive), value];
    setAnswers({ ...answers, [q.id]: list });
  };

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(0);
    setDir(1);
    setMode('quiz');
  };

  // L'accueil n'est proposé qu'une fois, quoi qu'on en fasse.
  useEffect(() => {
    if (onboarding) setOnboarded();
  }, [onboarding, setOnboarded]);

  const tryDemo = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setDemo(true);
    navigation.goBack();
  };

  // Le bouton retour d'Android revient à la question précédente.
  useEffect(() => {
    if (mode !== 'quiz') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  // --- Résultat ---------------------------------------------------------------
  const saved = profile?.answers;
  const score = useMemo(() => (saved ? scoreProfile(saved) : null), [saved]);

  const data = useMemo(() => {
    const crypto = totals.byAccount?.[ACCOUNTS.CRYPTO]?.value || 0;
    const funds = cash.accounts.filter((a) => INVESTED_KINDS.includes(a.kind)).reduce((s, a) => s + a.value, 0);
    const held = assets.filter((a) => a.isHeld);
    const exp = computeExposure(held, overrides);
    const country = exp.countries.find((c) => c.key !== 'OTHER');
    const topStock = exp.assets.filter((a) => a.kind === 'stock').reduce((m, a) => Math.max(m, a.value), 0);
    return {
      cashAccounts: cash.accounts,
      stockValue: Math.max(0, totals.value - crypto) + funds,
      cryptoValue: crypto,
      totalValue: overview.value,
      hasPea: !!pea,
      averageTer: computeFees(held, effectiveTers(fees)).averageTer,
      brokeragePct: brokerageFees({ transactions, fx }).last12.pct,
      topCountryPct: country?.pct || 0,
      topStockPct: overview.value > 0 ? (topStock / overview.value) * 100 : 0,
    };
  }, [cash.accounts, totals, overview.value, pea, assets, overrides, fees, transactions, fx]);

  const plan = useMemo(() => (saved ? buildPlan(saved, data) : []), [saved, data]);
  const targets = useMemo(() => (saved ? profileTargets(saved, { total: overview.value }) : null), [saved, overview.value]);
  const todo = plan.filter((p) => p.status !== 'done');
  const done = plan.filter((p) => p.status === 'done');
  // Les étapes à faire sont numérotées ; les alertes et repères gardent leur icône.
  const stepNumbers = {};
  todo.filter((p) => p.status === 'todo').forEach((p, i) => {
    stepNumbers[p.key] = i + 1;
  });

  const money = (v) => formatAmount(v, { decimals: 0 });
  const pct = (v) => formatPercent(v, { showSign: false, decimals: 0 });
  const stepText = (item, part) => t(`profile.plan.${item.key}.${part}`, {
    months: item.params.months,
    target: item.params.target != null ? money(item.params.target) : '',
    missing: item.params.missing != null ? money(item.params.missing) : '',
    covered: item.params.covered != null ? item.params.covered.toLocaleString(locale, { maximumFractionDigits: 1 }) : '',
    maxPayment: item.params.maxPayment != null ? money(item.params.maxPayment) : '',
    amount: item.params.amount != null ? money(item.params.amount) : '',
    current: item.params.current != null ? pct(item.params.current) : '',
    wanted: item.params.wanted != null ? pct(item.params.wanted) : '',
    cap: item.params.cap != null ? pct(item.params.cap) : '',
    pct: item.params.pct != null ? pct(item.params.pct) : '',
    ter: item.params.ter != null ? formatPercent(item.params.ter, { showSign: false, decimals: 2 }) : '',
    tmi: item.params.tmi,
    rate: item.params.rate != null ? formatPercent(item.params.rate, { showSign: false, decimals: 1 }) : '',
  });

  const applyTargets = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTargets(targets);
    navigation.navigate('Rebalance');
  };

  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const levelColors = [theme.colors.success, theme.colors.success, theme.colors.primary, theme.colors.warning, theme.colors.error];

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={mode === 'quiz' ? back : () => navigation.goBack()}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: theme.colors.text }]}>{t('profile.title')}</Text>
    </View>
  );

  if (mode === 'intro' || (mode === 'result' && !score)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        {header}
        <Animated.View entering={FadeIn.duration(400)} style={styles.center}>
          <Animated.View entering={ZoomIn.delay(150).springify()} style={[styles.bigIcon, { backgroundColor: theme.colors.primaryMuted }]}>
            <Ionicons name="compass-outline" size={44} color={theme.colors.primary} />
          </Animated.View>
          <Text style={[styles.introTitle, { color: theme.colors.text }]}>{t(onboarding ? 'profile.welcomeTitle' : 'profile.introTitle')}</Text>
          <Text style={[styles.introText, { color: theme.colors.textSecondary }]}>{t(onboarding ? 'profile.welcomeText' : 'profile.introText')}</Text>
          <Text style={[styles.introMeta, { color: theme.colors.textTertiary }]}>{t('profile.introMeta')}</Text>
          <TouchableOpacity style={[styles.cta, { backgroundColor: theme.colors.primary }]} onPress={start} accessibilityRole="button">
            <Text style={[styles.ctaText, { color: theme.colors.onPrimary }]}>{t('profile.start')}</Text>
          </TouchableOpacity>
          {onboarding && (
            <>
              <TouchableOpacity style={[styles.ctaSecondary, { borderColor: theme.colors.border }]} onPress={tryDemo} accessibilityRole="button">
                <Ionicons name="flask-outline" size={16} color={theme.colors.text} />
                <Text style={[styles.ctaSecondaryText, { color: theme.colors.text }]}>{t('profile.tryDemo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.later} accessibilityRole="button">
                <Text style={[styles.laterText, { color: theme.colors.textSecondary }]}>{t('profile.later')}</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (mode === 'thinking') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.center}>
          <Animated.View style={[styles.bigIcon, { backgroundColor: theme.colors.primaryMuted }, pulseStyle]}>
            <Ionicons name="sparkles-outline" size={44} color={theme.colors.primary} />
          </Animated.View>
          <Text style={[styles.introTitle, { color: theme.colors.text }]}>{t('profile.thinking')}</Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (mode === 'quiz') {
    const value = answers[q.id];
    const title = t(`profile.q.${q.id}.title`);
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        {header}
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <Animated.View style={[styles.progressFill, { backgroundColor: theme.colors.primary }, progressStyle]} />
          </View>
          <Text style={[styles.progressText, { color: theme.colors.textTertiary }]}>
            {questions.length - step - 1 > 0 ? t('profile.remaining', { count: questions.length - step - 1 }) : t('profile.last')}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View key={q.id} entering={(dir > 0 ? FadeInRight : FadeInLeft).duration(260)}>
            <View style={[styles.qIcon, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name={q.icon} size={22} color={theme.colors.primary} />
            </View>
            <Text style={[styles.qTitle, { color: theme.colors.text }]} accessibilityRole="header">{title}</Text>
            <Text style={[styles.qHint, { color: theme.colors.textSecondary }]}>{t(`profile.q.${q.id}.hint`)}</Text>

            {q.type === 'amount' && (
              <View style={styles.amount}>
                <Text style={[styles.amountValue, { color: theme.colors.text }]}>
                  {q.money ? t('profile.perMonth', { amount: money(value ?? q.initial) }) : t('profile.years', { count: value ?? q.initial })}
                </Text>
                <Slider
                  value={value ?? q.initial}
                  min={q.min}
                  max={q.max}
                  step={q.step}
                  onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                  accessibilityLabel={title}
                />
                <View style={styles.amountRange}>
                  <Text style={[styles.rangeText, { color: theme.colors.textTertiary }]}>{q.money ? money(q.min) : q.min}</Text>
                  <Text style={[styles.rangeText, { color: theme.colors.textTertiary }]}>{q.money ? `${money(q.max)}+` : `${q.max}+`}</Text>
                </View>
              </View>
            )}

            {q.type !== 'amount' && (
              <View style={styles.answers}>
                {q.options.map((opt, i) => (
                  <Animated.View key={opt} entering={FadeInDown.delay(60 + i * 45).duration(220)}>
                    <AnswerCard
                      icon={OPTION_ICONS[q.id]?.[opt] || 'ellipse-outline'}
                      label={t(`profile.q.${q.id}.options.${opt}`)}
                      selected={q.type === 'multi' ? (value || []).includes(opt) : value === opt}
                      onPress={() => (q.type === 'multi' ? toggle(opt) : choose(opt))}
                      theme={theme}
                      multi={q.type === 'multi'}
                    />
                  </Animated.View>
                ))}
              </View>
            )}

            {(q.type === 'amount' || q.type === 'multi') && (
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: theme.colors.primary }, q.type === 'multi' && !(value || []).length && styles.disabled]}
                disabled={q.type === 'multi' && !(value || []).length}
                onPress={() => {
                  Haptics.selectionAsync();
                  const final = q.type === 'amount' && value == null ? { ...answers, [q.id]: q.initial } : answers;
                  setAnswers(final);
                  next(final);
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.ctaText, { color: theme.colors.onPrimary }]}>{t('profile.continue')}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Résultat ---------------------------------------------------------------
  const level = score.level;
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(350)} style={[styles.hero, { backgroundColor: theme.colors.primaryMuted }]}>
          <Text style={[styles.heroLabel, { color: theme.colors.textSecondary }]}>{t('profile.yourProfile')}</Text>
          <Text style={[styles.heroName, { color: theme.colors.text }]}>{t(`profile.names.${score.profile}`)}</Text>
          <View style={styles.gauge}>
            {PROFILES.map((p, i) => (
              <View key={p} style={[styles.gaugeSlot, { backgroundColor: theme.colors.surface }]}>
                {i < level && (
                  <Animated.View entering={ZoomIn.delay(250 + i * 140).duration(220)} style={[styles.gaugeFill, { backgroundColor: levelColors[i] }]} />
                )}
              </View>
            ))}
          </View>
          <View style={styles.gaugeLabels}>
            <Text style={[styles.gaugeLabel, { color: theme.colors.textTertiary }]}>{t('profile.names.prudent')}</Text>
            <Text style={[styles.gaugeLabel, { color: theme.colors.textTertiary }]}>{t('profile.names.bold')}</Text>
          </View>
          <Text style={[styles.heroText, { color: theme.colors.text }]}>{t(`profile.desc.${score.profile}`)}</Text>
          <Text style={[styles.heroWhy, { color: theme.colors.textSecondary }]}>
            {t('profile.why', { capacity: score.capacity, tolerance: score.tolerance })}
          </Text>
        </Animated.View>

        {(numbers.income || numbers.expenses) && (
          <Animated.View entering={FadeInDown.delay(100).duration(350)} style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('profile.numbersTitle')}</Text>
            <View style={styles.numbers}>
              {[
                ['income', numbers.income],
                ['expenses', numbers.expenses],
                ['savings', numbers.savings],
              ].map(([k, v]) => (
                <View key={k} style={[styles.number, { backgroundColor: theme.colors.backgroundSecondary }]}>
                  <Text style={[styles.numberLabel, { color: theme.colors.textTertiary }]}>{t(`profile.numbers.${k}`)}</Text>
                  <Text style={[styles.numberValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{v ? money(v) : '—'}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
              {t(numbers.fromBudget ? 'profile.numbersFromBudget' : 'profile.numbersFromAnswers')}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Budget')} style={[styles.secondary, { borderColor: theme.colors.primary }]} accessibilityRole="button">
              <Ionicons name="git-network-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.secondaryText, { color: theme.colors.primary }]}>{t('profile.openBudget')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {targets && overview.value > 0 && (
          <Animated.View entering={FadeInDown.delay(150).duration(350)} style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('profile.allocationTitle')}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
              {t('profile.allocationText', { stock: pct(STOCK_SHARE[level - 1]) })}
            </Text>
            <View style={[styles.bar, { backgroundColor: theme.colors.backgroundSecondary }]}>
              {[['stock', theme.colors.primary], ['crypto', theme.colors.warning], ['cash', theme.colors.success]].map(([k, color]) => (
                targets[k] > 0 ? <View key={k} style={{ flex: targets[k], backgroundColor: color }} /> : null
              ))}
            </View>
            <View style={styles.legend}>
              {[['stock', theme.colors.primary], ['crypto', theme.colors.warning], ['cash', theme.colors.success]].map(([k, color]) => (
                <View key={k} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>{t(`profile.classes.${k}`)} {pct(targets[k])}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={applyTargets} style={[styles.secondary, { borderColor: theme.colors.primary }]} accessibilityRole="button">
              <Ionicons name="pie-chart-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.secondaryText, { color: theme.colors.primary }]}>{t('profile.applyTargets')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(250).duration(350)} style={cardStyle}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('profile.planTitle')}</Text>
          {!todo.length && <Text style={[styles.sub, { color: theme.colors.success }]}>{t('profile.allGood')}</Text>}
          {todo.map((item, i) => {
            const tint = item.status === 'warning' ? theme.colors.warning : item.status === 'info' ? theme.colors.textSecondary : theme.colors.primary;
            const Row = item.route ? TouchableOpacity : View;
            return (
              <Animated.View key={item.key} entering={FadeInDown.delay(350 + i * 70).duration(260)}>
                <Row
                  style={[styles.step, i < todo.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                  {...(item.route ? { onPress: () => navigation.navigate(item.route), accessibilityRole: 'button' } : {})}
                >
                  <View style={[styles.stepBadge, { backgroundColor: item.status === 'todo' ? theme.colors.primary : 'transparent' }]}>
                    {item.status === 'todo'
                      ? <Text style={[styles.stepNumber, { color: theme.colors.onPrimary }]}>{stepNumbers[item.key]}</Text>
                      : <Ionicons name={STATUS_ICONS[item.status]} size={22} color={tint} />}
                  </View>
                  <View style={styles.stepMain}>
                    <Text style={[styles.stepTitle, { color: theme.colors.text }]}>{stepText(item, 'title')}</Text>
                    <Text style={[styles.stepText, { color: theme.colors.textSecondary }]}>{stepText(item, 'text')}</Text>
                  </View>
                  {item.route && <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />}
                </Row>
              </Animated.View>
            );
          })}
        </Animated.View>

        {done.length > 0 && (
          <Animated.View entering={FadeInDown.delay(400).duration(350)} style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('profile.doneTitle')}</Text>
            {done.map((item) => (
              <View key={item.key} style={styles.step}>
                <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                <View style={styles.stepMain}>
                  <Text style={[styles.stepTitle, { color: theme.colors.text }]}>{stepText(item, 'title')}</Text>
                  <Text style={[styles.stepText, { color: theme.colors.textSecondary }]}>{stepText(item, 'text')}</Text>
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        {onboarding && (
          <>
            <TouchableOpacity style={[styles.cta, { backgroundColor: theme.colors.primary }]} onPress={() => navigation.navigate('Budget')} accessibilityRole="button">
              <Text style={[styles.ctaText, { color: theme.colors.onPrimary }]}>{t('profile.nextBudget')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.later} accessibilityRole="button">
              <Text style={[styles.laterText, { color: theme.colors.textSecondary }]}>{t('profile.toDashboard')}</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={[styles.disclaimer, { color: theme.colors.textTertiary }]}>{t('profile.disclaimer')}</Text>
        <TouchableOpacity onPress={start} style={styles.redo} accessibilityRole="button">
          <Ionicons name="refresh-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.redoText, { color: theme.colors.primary }]}>{t('profile.redo')}</Text>
        </TouchableOpacity>
        {profile?.completedAt && (
          <Text style={[styles.disclaimer, { color: theme.colors.textTertiary, textAlign: 'center' }]}>
            {t('profile.completedAt', { date: formatDate(profile.completedAt, { locale }) })}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 14, paddingBottom: 60 },
  bigIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  introTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  introText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  introMeta: { fontSize: 12, textAlign: 'center' },
  cta: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', marginTop: 18, alignSelf: 'stretch' },
  ctaText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  ctaSecondary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignSelf: 'stretch' },
  ctaSecondaryText: { fontSize: 15, fontWeight: '600' },
  later: { paddingVertical: 12, alignItems: 'center' },
  laterText: { fontSize: 14, fontWeight: '600' },
  progressWrap: { paddingHorizontal: 16, paddingBottom: 4, gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressText: { fontSize: 12 },
  qIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  qTitle: { fontSize: 22, fontWeight: '800', lineHeight: 28, marginTop: 14 },
  qHint: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  answers: { marginTop: 18, gap: 10 },
  answer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 12, minHeight: 60 },
  answerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  answerText: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  amount: { marginTop: 28, gap: 12 },
  amountValue: { fontSize: 34, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  amountRange: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeText: { fontSize: 12 },
  hero: { borderRadius: 20, padding: 20, marginBottom: 12 },
  heroLabel: { fontSize: 13, fontWeight: '600' },
  heroName: { fontSize: 30, fontWeight: '800', marginTop: 2 },
  gauge: { flexDirection: 'row', gap: 6, marginTop: 16 },
  gaugeSlot: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  gaugeFill: { flex: 1, borderRadius: 5 },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  gaugeLabel: { fontSize: 11 },
  heroText: { fontSize: 15, lineHeight: 22, marginTop: 14 },
  heroWhy: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  numbers: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 },
  number: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, gap: 2 },
  numberLabel: { fontSize: 11, fontWeight: '600' },
  numberValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 14, gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12 },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 10, marginTop: 14 },
  secondaryText: { fontSize: 14, fontWeight: '600' },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumber: { fontSize: 13, fontWeight: '800' },
  stepMain: { flex: 1, gap: 3 },
  stepTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  stepText: { fontSize: 13, lineHeight: 19 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 6, paddingHorizontal: 4 },
  redo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  redoText: { fontSize: 14, fontWeight: '600' },
});

export default ProfileScreen;
