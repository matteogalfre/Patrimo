/**
 * Feuille de choix dans une liste : un titre, des options, une coche sur
 * l'option courante. Le choix ferme la feuille.
 */

import React from 'react';
import { Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../theme/theme';
import BottomSheet from './BottomSheet';

const MAX_HEIGHT = Dimensions.get('window').height * 0.6;

const OptionSheet = ({ visible, onClose, title, message, options = [], value, onSelect }) => {
  const theme = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {!!message && <Text style={[styles.message, { color: theme.colors.textSecondary }]}>{message}</Text>}
      <ScrollView style={{ maxHeight: MAX_HEIGHT }} contentContainerStyle={styles.list}>
        {options.map((o, i) => {
          const selected = o.key === value;
          return (
            <TouchableOpacity
              key={o.key ?? `none-${i}`}
              onPress={() => {
                Haptics.selectionAsync();
                onSelect?.(o.key);
              }}
              style={[styles.row, i < options.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.label, { color: selected ? theme.colors.primary : theme.colors.text }]}>{o.label}</Text>
              {!!o.hint && <Text style={[styles.hint, { color: theme.colors.textTertiary }]} numberOfLines={1}>{o.hint}</Text>}
              {selected && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  list: { paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  label: { flex: 1, fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, maxWidth: '45%' },
});

export default OptionSheet;
