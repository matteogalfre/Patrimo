/**
 * Champ de date (sans heure : un cours de clôture par jour suffit).
 * Android : boîte de dialogue native. iOS : sélecteur dans une feuille avec
 * Annuler / Valider, pour pouvoir revenir en arrière sans rien changer.
 * Pas de date future, sauf `allowFuture` (échéance d'un objectif) ou
 * `anyDate` (n'importe quelle date).
 */

import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';
import BottomSheet from '../Modal/BottomSheet';

// Majuscule au seul premier mot : « Mar. 3 novembre 2026 », pas « Novembre ».
const formatLong = (d, locale) => {
  const s = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const clampToToday = (d) => {
  const now = new Date();
  return d > now ? now : d;
};

const DateField = ({ value, onChange, label, allowFuture = false, anyDate = false }) => {
  const theme = useTheme();
  const { t, locale } = useSettings();
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value);

  const show = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTemp(value);
    setOpen(true);
  }, [value]);

  // anyDate : passé comme futur (première échéance d'un crédit, date d'achat d'un bien).
  const clamp = useCallback((d) => (allowFuture || anyDate ? d : clampToToday(d)), [allowFuture, anyDate]);
  const maximumDate = allowFuture || anyDate ? undefined : new Date();
  const minimumDate = allowFuture && !anyDate ? new Date() : undefined;

  const onAndroidChange = useCallback((event, selected) => {
    setOpen(false);
    if (event.type === 'set' && selected) onChange(clamp(selected));
  }, [onChange, clamp]);

  return (
    <>
      <TouchableOpacity
        style={[styles.field, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
        <Text style={[styles.text, { color: theme.colors.text }]}>{formatLong(value, locale)}</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </TouchableOpacity>

      {Platform.OS === 'android' && open && (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={onAndroidChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <BottomSheet visible={open} onClose={() => setOpen(false)}>
          <DateTimePicker
            value={temp}
            mode="date"
            display="inline"
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            onChange={(_e, d) => d && setTemp(d)}
            themeVariant={theme.isDark ? 'dark' : 'light'}
          />
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.colors.backgroundSecondary }]}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.btnText, { color: theme.colors.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.colors.primary }]}
              onPress={() => {
                onChange(clamp(temp));
                setOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.btnText, { color: theme.colors.onPrimary }]}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  text: { flex: 1, fontSize: 15, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
});

export default DateField;
