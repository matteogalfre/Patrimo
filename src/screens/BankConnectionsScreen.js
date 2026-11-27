/**
 * Banques reliées : les clés GoCardless, les banques connectées et leurs
 * comptes, le choix du compte Patrimo que chacun alimente, la mise à jour
 * des soldes et le renouvellement de l'accord.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';

import { useTheme } from '../theme/theme';
import { useSettings } from '../context/SettingsContext';
import { usePortfolio } from '../context/PortfolioContext';
import { useBank } from '../context/BankContext';
import { ConfirmModal } from '../components';
import { linkStatus, nextSyncAt } from '../core/bankSync';
import { institutionById, institutionLogoUrl, normalizeName } from '../core/institutions';
import { formatDate, formatRelativeDate, formatTime } from '../utils/formatters';

const PORTAL = 'https://bankaccountdata.gocardless.com/user-secrets/';
const MASK = '•••';

const errorKey = (err) => {
  if (err?.message === 'EMPTY') return 'banks.errors.empty';
  if (err?.statusCode === 401 || err?.statusCode === 403) return 'banks.errors.keys';
  if (err?.statusCode === 429) return 'banks.errors.quota';
  if (!err?.statusCode) return 'banks.errors.network';
  return 'banks.errors.generic';
};

const BankLogo = ({ link, size = 36, theme }) => {
  const local = institutionById(link.institution);
  const uri = link.logo || institutionLogoUrl(local);
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (!uri || failed) {
    return (
      <View style={[styles.logo, box, { backgroundColor: local?.color || theme.colors.primaryMuted }]}>
        <Text style={[styles.logoText, { color: local?.color ? '#FFFFFF' : theme.colors.primary }]}>
          {(link.institutionName || link.name || '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.logo, box, { backgroundColor: '#FFFFFF', borderColor: theme.colors.border }]}>
      <Image source={{ uri }} style={{ width: size - 8, height: size - 8 }} resizeMode="contain" onError={() => setFailed(true)} />
    </View>
  );
};

const BankConnectionsScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { t, locale, language, formatAmount, privacyMode, currency: baseCurrency } = useSettings();
  const { cashAccounts, demo } = usePortfolio();
  const {
    ready, links, hasKeys, syncing, linkedIds, saveKeys, removeKeys, loadInstitutions,
    connect, renew, resolveLink, assignAccounts, syncAll, disconnect, unassign, ignore, suggestFor,
  } = useBank();

  const [secretId, setSecretId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);
  const [message, setMessage] = useState(null); // { tone: 'error'|'ok', text }
  const [picker, setPicker] = useState(false);
  const [institutions, setInstitutions] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null); // texte de l'action en cours
  const [choices, setChoices] = useState({});
  const [confirm, setConfirm] = useState(null);

  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const kindLabel = useCallback((kind) => t(`cash.kinds.${kind}`), [t]);

  const money = useCallback((amount, code) => {
    if (amount === null || amount === undefined) return '—';
    if (privacyMode) return MASK;
    if (!code || code === baseCurrency) return formatAmount(amount);
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${code}`;
    }
  }, [baseCurrency, formatAmount, locale, privacyMode]);

  const cashById = useMemo(() => new Map(cashAccounts.map((c) => [c.id, c])), [cashAccounts]);
  const toAssign = links.filter((l) => l.status === 'linked' && l.accounts.some((a) => a.state === 'new'));
  const shown = links.filter((l) => !toAssign.includes(l));

  // Choix proposés par défaut : le compte Patrimo qui ressemble, sinon un nouveau.
  useEffect(() => {
    setChoices((prev) => {
      const next = { ...prev };
      const used = [...linkedIds];
      toAssign.forEach((link) => link.accounts.filter((a) => a.state === 'new').forEach((a) => {
        if (next[a.id]) return;
        // Une carte à débit différé n'est pas de l'argent disponible : ignorée par défaut.
        const suggested = a.card ? null : suggestFor(a, link, used);
        if (suggested) used.push(suggested);
        next[a.id] = a.card ? 'skip' : suggested || 'new';
      }));
      return next;
    });
  }, [toAssign.length, links]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculé à chaque rendu : l'heure avance même si les liens ne changent pas.
  const nextAt = (() => {
    const times = links.flatMap((l) => (['ok', 'expiring'].includes(linkStatus(l)) ? l.accounts : []))
      .filter((a) => a.cashId).map(nextSyncAt);
    if (!times.length) return null;
    const soonest = Math.min(...times);
    return soonest > Date.now() ? soonest : 0;
  })();

  const onSaveKeys = async () => {
    tap();
    setSavingKeys(true);
    setMessage(null);
    try {
      await saveKeys(secretId, secretKey);
      setSecretId('');
      setSecretKey('');
      setMessage({ tone: 'ok', text: t('banks.keys.saved') });
    } catch (err) {
      setMessage({ tone: 'error', text: t(errorKey(err)) });
    } finally {
      setSavingKeys(false);
    }
  };

  const openPicker = async () => {
    tap();
    setMessage(null);
    setPicker(true);
    if (institutions) return;
    try {
      setInstitutions(await loadInstitutions());
    } catch (err) {
      setPicker(false);
      setMessage({ tone: 'error', text: t(errorKey(err)) });
    }
  };

  const outcome = (result) => {
    if (result === 'linked') setMessage({ tone: 'ok', text: t('banks.connected') });
    else if (result === 'pending') setMessage({ tone: 'ok', text: t('banks.pendingHint') });
    else setMessage({ tone: 'error', text: t('banks.cancelled') });
  };

  const run = async (label, fn) => {
    setBusy(label);
    setMessage(null);
    try {
      outcome(await fn());
    } catch (err) {
      setMessage({ tone: 'error', text: t(errorKey(err)) });
    } finally {
      setBusy(null);
    }
  };

  const onPick = (institution) => {
    tap();
    setPicker(false);
    setQuery('');
    run(t('banks.opening', { bank: institution.name }), () => connect(institution, { language }));
  };

  const onSync = async () => {
    tap();
    setMessage(null);
    try {
      const { updated, failed } = await syncAll();
      if (failed) setMessage({ tone: 'error', text: t('banks.syncFailed', { count: failed }) });
      else setMessage({ tone: 'ok', text: t('banks.synced', { count: updated }) });
    } catch (err) {
      setMessage({ tone: 'error', text: t(errorKey(err)) });
    }
  };

  const onAssign = async (link) => {
    tap();
    setBusy(t('banks.saving'));
    try {
      await assignAccounts(link.id, choices, kindLabel);
      setMessage({ tone: 'ok', text: t('banks.assigned') });
    } catch (err) {
      setMessage({ tone: 'error', text: t(errorKey(err)) });
    } finally {
      setBusy(null);
    }
  };

  // Arrivée depuis « Ajouter un compte » : la liste des banques s'ouvre directement.
  const wantsPicker = !!route?.params?.pick;
  useEffect(() => {
    if (wantsPicker && ready && hasKeys && !demo) openPicker();
  }, [wantsPicker, ready, hasKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    if (!institutions) return [];
    return q ? institutions.filter((i) => normalizeName(i.name).includes(q)) : institutions;
  }, [institutions, query]);

  const statusLine = (link) => {
    const status = linkStatus(link);
    if (status === 'pending') return { text: t('banks.status.pending'), color: theme.colors.warning };
    if (status === 'expired') return { text: t('banks.status.expired'), color: theme.colors.error };
    const until = formatDate(link.validUntil, { locale });
    if (status === 'expiring') return { text: t('banks.status.expiring', { date: until }), color: theme.colors.warning };
    return { text: t('banks.status.ok', { date: until }), color: theme.colors.textSecondary };
  };

  const disabled = demo || !hasKeys || !!busy;

  const renderAssign = (link) => {
    const used = new Set(linkedIds);
    return (
      <View key={`assign-${link.id}`} style={[...cardStyle, { borderColor: theme.colors.primary }]}>
        <View style={styles.row}>
          <BankLogo link={link} theme={theme} />
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('banks.assignTitle', { bank: link.institutionName })}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('banks.assignHint')}</Text>
          </View>
        </View>
        {link.accounts.filter((a) => a.state === 'new').map((a, _, pending) => {
          // Un compte Patrimo ne peut recevoir qu'un compte bancaire.
          const others = new Set(pending.filter((o) => o.id !== a.id).map((o) => choices[o.id]));
          const options = [
            { id: 'new', label: t('banks.newAccount') },
            ...cashAccounts
              .filter((c) => c.currency === a.currency && !others.has(c.id) && (!used.has(c.id) || choices[a.id] === c.id))
              .map((c) => ({ id: c.id, label: c.name })),
            { id: 'skip', label: t('banks.skip') },
          ];
          return (
            <View key={a.id} style={[styles.assignRow, { borderTopColor: theme.colors.border }]}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={[styles.accountName, { color: theme.colors.text }]} numberOfLines={1}>{a.name || kindLabel(a.kind)}</Text>
                  <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{a.card ? t('banks.cardHint') : kindLabel(a.kind)}</Text>
                </View>
                <Text style={[styles.amount, { color: theme.colors.text }]}>{money(a.balance, a.currency)}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {options.map((o) => {
                  const active = (choices[a.id] || 'new') === o.id;
                  return (
                    <TouchableOpacity
                      key={o.id}
                      onPress={() => { tap(); setChoices((p) => ({ ...p, [a.id]: o.id })); }}
                      style={[styles.chip, {
                        backgroundColor: active ? theme.colors.primary : theme.colors.background,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, { color: active ? theme.colors.onPrimary : theme.colors.text }]} numberOfLines={1}>
                        {o.id === 'new' ? `+ ${o.label}` : o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : 1 }]}
          onPress={() => onAssign(link)}
          disabled={!!busy}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{t('banks.assignConfirm')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderLink = (link) => {
    const status = linkStatus(link);
    const line = statusLine(link);
    return (
      <View key={link.id} style={cardStyle}>
        <View style={styles.row}>
          <BankLogo link={link} theme={theme} />
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>{link.institutionName}</Text>
            <Text style={[styles.meta, { color: line.color }]}>{line.text}</Text>
          </View>
        </View>

        {link.accounts.filter((a) => a.state !== 'new').map((a) => {
          const target = a.cashId ? cashById.get(a.cashId) : null;
          const orphan = a.state === 'linked' && !target && !demo;
          if (orphan) {
            return (
              <View key={a.id} style={[styles.accountRow, { borderTopColor: theme.colors.border }]}>
                <View style={styles.flex}>
                  <Text style={[styles.accountName, { color: theme.colors.text }]} numberOfLines={1}>{a.name || kindLabel(a.kind)}</Text>
                  <Text style={[styles.meta, { color: theme.colors.warning }]}>{t('banks.orphan')}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.smallButton, { borderColor: theme.colors.primary }]}
                  onPress={() => { tap(); unassign(link.id, a.id); }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.smallText, { color: theme.colors.primary }]}>{t('banks.reassign')}</Text>
                </TouchableOpacity>
              </View>
            );
          }
          return (
            <View key={a.id} style={[styles.accountRow, { borderTopColor: theme.colors.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.accountName, { color: a.state === 'ignored' ? theme.colors.textTertiary : theme.colors.text }]} numberOfLines={1}>
                  {target?.name || a.name || kindLabel(a.kind)}
                </Text>
                <Text style={[styles.meta, { color: a.lastError ? theme.colors.warning : theme.colors.textTertiary }]} numberOfLines={2}>
                  {a.state === 'ignored'
                    ? t('banks.ignored')
                    : a.lastError
                      ? ['401', '403'].includes(a.lastError) ? t('banks.accountRefused') : t('banks.accountError')
                      : a.lastSync ? t('banks.updatedAgo', { when: formatRelativeDate(a.lastSync, { t }) }) : t('banks.neverSynced')}
                </Text>
                {a.state !== 'ignored' && !!a.lastErrorDetail && (
                  <Text style={[styles.detail, { color: theme.colors.textTertiary }]} numberOfLines={2}>{a.lastErrorDetail}</Text>
                )}
              </View>
              {a.state !== 'ignored' && a.lastError && (
                <TouchableOpacity
                  style={[styles.smallButton, { borderColor: theme.colors.border }]}
                  onPress={() => { tap(); ignore(link.id, a.id); }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.smallText, { color: theme.colors.textSecondary }]}>{t('banks.stopFollowing')}</Text>
                </TouchableOpacity>
              )}
              {a.state !== 'ignored' && !a.lastError && (
                <Text style={[styles.amount, { color: theme.colors.text }]}>{money(a.balance, a.currency)}</Text>
              )}
            </View>
          );
        })}

        <View style={styles.actions}>
          {status === 'pending' && (
            <TouchableOpacity
              style={[styles.smallButton, { borderColor: theme.colors.primary }]}
              onPress={() => { tap(); run(t('banks.checking'), () => resolveLink(link.id)); }}
              disabled={disabled}
              accessibilityRole="button"
            >
              <Text style={[styles.smallText, { color: theme.colors.primary }]}>{t('banks.check')}</Text>
            </TouchableOpacity>
          )}
          {(status === 'expiring' || status === 'expired') && (
            <TouchableOpacity
              style={[styles.smallButton, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
              onPress={() => { tap(); run(t('banks.opening', { bank: link.institutionName }), () => renew(link.id, { language })); }}
              disabled={disabled}
              accessibilityRole="button"
            >
              <Text style={[styles.smallText, { color: theme.colors.onPrimary }]}>{t('banks.renew')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.smallButton, { borderColor: theme.colors.border }]}
            onPress={() => { tap(); setConfirm(link); }}
            disabled={!!busy}
            accessibilityRole="button"
          >
            <Text style={[styles.smallText, { color: theme.colors.textSecondary }]}>
              {status === 'pending' ? t('common.cancel') : t('banks.disconnect')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('banks.title')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="link-outline" size={20} color={theme.colors.primary} />
              </View>
              <Text style={[styles.cardTitle, styles.flex, { color: theme.colors.text }]}>{t('banks.introTitle')}</Text>
            </View>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('banks.intro')}</Text>
          </View>

          {demo && (
            <View style={[...cardStyle, { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warning }]}>
              <Text style={[styles.sub, styles.noTop, { color: theme.colors.text }]}>{t('banks.demo')}</Text>
            </View>
          )}

          {!!message && (
            <View style={[styles.message, { backgroundColor: message.tone === 'error' ? theme.colors.errorBg : theme.colors.successBg }]}>
              <Ionicons
                name={message.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                size={18}
                color={message.tone === 'error' ? theme.colors.error : theme.colors.success}
              />
              <Text style={[styles.messageText, { color: theme.colors.text }]}>{message.text}</Text>
            </View>
          )}

          {!!busy && (
            <View style={[styles.message, { backgroundColor: theme.colors.primaryMuted }]}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.messageText, { color: theme.colors.text }]}>{busy}</Text>
            </View>
          )}

          {ready && !hasKeys && (
            <View style={cardStyle}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('banks.keys.title')}</Text>
              <Text style={[styles.sub, styles.closedNote, { color: theme.colors.warning }]}>{t('banks.keys.closed')}</Text>
              <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('banks.keys.steps')}</Text>
              <TouchableOpacity onPress={() => { tap(); WebBrowser.openBrowserAsync(PORTAL); }} style={styles.link} accessibilityRole="link">
                <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('banks.keys.portal')}</Text>
              </TouchableOpacity>
              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Secret ID</Text>
              <TextInput
                value={secretId}
                onChangeText={setSecretId}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                importantForAutofill="no"
                style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                placeholderTextColor={theme.colors.textTertiary}
                placeholder="xxxxxxxx-xxxx-…"
              />
              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Secret Key</Text>
              <TextInput
                value={secretKey}
                onChangeText={setSecretKey}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                importantForAutofill="no"
                style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                placeholderTextColor={theme.colors.textTertiary}
                placeholder="••••••••"
              />
              <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('banks.keys.privacy')}</Text>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.colors.primary, opacity: savingKeys || demo ? 0.6 : 1 }]}
                onPress={onSaveKeys}
                disabled={savingKeys || demo}
                accessibilityRole="button"
              >
                {savingKeys
                  ? <ActivityIndicator color={theme.colors.onPrimary} />
                  : <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{t('banks.keys.save')}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {toAssign.map(renderAssign)}
          {shown.map(renderLink)}
          {links.some((l) => l.status === 'linked') && (
            <Text style={[styles.note, styles.missing, { color: theme.colors.textSecondary }]}>{t('banks.missingSavings')}</Text>
          )}

          {hasKeys && (
            <>
              {links.some((l) => l.status !== 'pending') && (
                <TouchableOpacity
                  style={[styles.button, styles.outline, { borderColor: theme.colors.primary, opacity: disabled || syncing || nextAt ? 0.55 : 1 }]}
                  onPress={onSync}
                  disabled={disabled || syncing || !!nextAt}
                  accessibilityRole="button"
                >
                  {syncing
                    ? <ActivityIndicator color={theme.colors.primary} />
                    : (
                      <Text style={[styles.buttonText, { color: theme.colors.primary }]}>
                        {nextAt ? t('banks.nextSync', { time: formatTime(nextAt) }) : t('banks.sync')}
                      </Text>
                    )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.colors.primary, opacity: disabled ? 0.55 : 1 }]}
                onPress={openPicker}
                disabled={disabled}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{t('banks.add')}</Text>
              </TouchableOpacity>
              <Text style={[styles.note, styles.center, { color: theme.colors.textTertiary }]}>{t('banks.quota')}</Text>
              <TouchableOpacity onPress={() => { tap(); setConfirm('keys'); }} style={[styles.link, styles.centerSelf]} accessibilityRole="button">
                <Text style={[styles.linkText, { color: theme.colors.textSecondary }]}>{t('banks.keys.remove')}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={picker} animationType="slide" onRequestClose={() => setPicker(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setPicker(false)} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.colors.text }]}>{t('banks.pickTitle')}</Text>
          </View>
          <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('banks.searchPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              style={[styles.searchInput, { color: theme.colors.text }]}
              autoCorrect={false}
              autoFocus
            />
          </View>
          {!institutions ? (
            <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(i) => i.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              initialNumToRender={20}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.bankRow, { borderBottomColor: theme.colors.border }]} onPress={() => onPick(item)} accessibilityRole="button">
                  <BankLogo link={{ logo: item.logo, institutionName: item.name }} size={32} theme={theme} />
                  <Text style={[styles.bankName, { color: theme.colors.text }]} numberOfLines={2}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={[styles.note, styles.center, { color: theme.colors.textSecondary }]}>{t('banks.noResult')}</Text>}
            />
          )}
        </SafeAreaView>
      </Modal>

      <ConfirmModal
        visible={!!confirm}
        title={confirm === 'keys' ? t('banks.keys.removeTitle') : t('banks.disconnectTitle', { bank: confirm?.institutionName || '' })}
        message={confirm === 'keys' ? t('banks.keys.removeMsg') : t('banks.disconnectMsg')}
        confirmText={confirm === 'keys' ? t('banks.keys.removeConfirm') : t('banks.disconnect')}
        cancelText={t('common.cancel')}
        destructive
        onConfirm={async () => {
          const target = confirm;
          setConfirm(null);
          setMessage(null);
          if (target === 'keys') await removeKeys();
          else if (target) await disconnect(target.id);
        }}
        onClose={() => setConfirm(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 48 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  closedNote: { marginBottom: 8 },
  noTop: { marginTop: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  logo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  logoText: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 2 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 12 },
  assignRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 12 },
  accountName: { fontSize: 14, fontWeight: '600' },
  amount: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chips: { gap: 8, paddingTop: 10 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 220 },
  chipText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  smallButton: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center' },
  smallText: { fontSize: 13, fontWeight: '700' },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 12 },
  messageText: { flex: 1, fontSize: 13, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  missing: { marginTop: 0, marginBottom: 4, paddingHorizontal: 4 },
  detail: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  center: { textAlign: 'center' },
  centerSelf: { alignSelf: 'center' },
  link: { minHeight: 40, justifyContent: 'center', marginTop: 4 },
  linkText: { fontSize: 14, fontWeight: '600' },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  outline: { borderWidth: 1.5 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 11 },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  bankName: { flex: 1, fontSize: 15 },
});

export default BankConnectionsScreen;
