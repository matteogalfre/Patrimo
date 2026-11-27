/**
 * Modale de gestion des alertes de prix pour un actif.
 *
 * Les seuils sont dans la devise de cotation de l'actif. On affiche la
 * liste existante (toggle + suppression) et un petit formulaire d'ajout
 * (seuil + direction au-dessus/en-dessous).
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BaseModal } from '..';
import { useAlerts } from '../../context/AlertsContext';
import { useSettings } from '../../context/SettingsContext';
import { normalizeNumber } from '../../utils/parseNumber';

const AlertsModal = ({ visible, onClose, assetId, symbol, currentPrice, currency, theme, t }) => {
  const { getAlertsFor, addAlert, removeAlert, toggleAlert } = useAlerts();
  const { formatPrice } = useSettings();
  const [target, setTarget] = useState('');
  const [direction, setDirection] = useState('above');

  const symbolAlerts = useMemo(
    () => getAlertsFor(assetId),
    [getAlertsFor, assetId],
  );

  const handleAdd = useCallback(() => {
    const normalized = parseFloat(normalizeNumber(target));
    if (!Number.isFinite(normalized) || normalized <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addAlert({ assetId, symbol, currency, targetPrice: normalized, direction });
    setTarget('');
  }, [target, addAlert, assetId, symbol, currency, direction]);

  const renderAlert = useCallback(
    ({ item }) => (
      <View style={[styles.alertRow, { borderColor: theme.colors.border }]}>
        <Ionicons
          name={item.direction === 'above' ? 'trending-up' : 'trending-down'}
          size={20}
          color={item.direction === 'above' ? theme.colors.success : theme.colors.error}
        />
        <View style={styles.alertInfo}>
          <Text style={[styles.alertPrice, { color: theme.colors.text }]}>
            {item.direction === 'above' ? '≥' : '≤'} {formatPrice(item.targetPrice, item.currency || currency)}
          </Text>
          <Text style={[styles.alertStatus, { color: theme.colors.textSecondary }]}>
            {item.triggered
              ? t('alerts.statusTriggered')
              : item.enabled
                ? t('alerts.statusActive')
                : t('common.disabled')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => toggleAlert(item.id)}
          accessibilityRole="switch"
          accessibilityState={{ checked: item.enabled }}
          accessibilityLabel={t('alerts.toggle')}
          style={[
            styles.toggle,
            { backgroundColor: item.enabled ? theme.colors.primary : theme.colors.border },
          ]}
        >
          <View
            style={[
              styles.toggleDot,
              { backgroundColor: '#FFF', transform: [{ translateX: item.enabled ? 18 : 2 }] },
            ]}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => removeAlert(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
        </TouchableOpacity>
      </View>
    ),
    [theme, t, toggleAlert, removeAlert, formatPrice, currency],
  );

  return (
    <BaseModal visible={visible} onClose={onClose} title={t('alerts.title', { symbol })}>
      <View style={styles.wrap}>
        {currentPrice > 0 && (
          <Text style={[styles.currentPrice, { color: theme.colors.textSecondary }]}>
            {t('alerts.currentPrice')}: {formatPrice(currentPrice, currency)}
          </Text>
        )}

        {/* Sélecteur de direction */}
        <View style={styles.directionRow}>
          {['above', 'below'].map((dir) => {
            const active = direction === dir;
            return (
              <TouchableOpacity
                key={dir}
                onPress={() => setDirection(dir)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.directionBtn,
                  {
                    backgroundColor: active ? theme.colors.primaryMuted : 'transparent',
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                <Ionicons
                  name={dir === 'above' ? 'trending-up' : 'trending-down'}
                  size={18}
                  color={dir === 'above' ? theme.colors.success : theme.colors.error}
                />
                <Text style={[styles.directionText, { color: theme.colors.text }]}>
                  {dir === 'above' ? t('alerts.above') : t('alerts.below')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Saisie du seuil + ajout */}
        <View style={styles.inputRow}>
          <View style={[styles.inputWrap, { backgroundColor: theme.colors.surfacePressed, borderColor: theme.colors.border }]}>
            <Text style={[styles.inputPrefix, { color: theme.colors.textSecondary }]}>{currency}</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
              placeholder={currentPrice > 0 ? String(currentPrice) : '0.00'}
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel={t('alerts.targetPrice')}
            />
          </View>
          <TouchableOpacity
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel={t('alerts.add')}
            style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
          >
            <Ionicons name="add" size={22} color={theme.colors.onPrimary} />
          </TouchableOpacity>
        </View>

        {symbolAlerts.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textTertiary }]}>
            {t('alerts.empty')}
          </Text>
        ) : (
          <FlatList
            data={symbolAlerts}
            keyExtractor={(item) => item.id}
            renderItem={renderAlert}
            style={styles.list}
            scrollEnabled={false}
          />
        )}
      </View>
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  currentPrice: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  directionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  directionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  directionText: { fontSize: 14, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  inputPrefix: { fontSize: 16, fontWeight: '600', marginRight: 4 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
  addBtn: {
    width: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  list: { width: '100%' },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  alertInfo: { flex: 1 },
  alertPrice: { fontSize: 15, fontWeight: '600' },
  alertStatus: { fontSize: 12, marginTop: 2 },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleDot: { width: 22, height: 22, borderRadius: 11 },
  deleteBtn: { padding: 4 },
});

export default AlertsModal;
