/**
 * Carte « Planifier » : un accès court à chaque outil, plutôt qu'une carte
 * par outil empilée sur le tableau de bord.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';

const ToolsCard = ({ items, navigation }) => {
  const theme = useTheme();
  const { t } = useSettings();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{t('tools.title')}</Text>
      {items.map((item, i) => (
        <TouchableOpacity
          key={item.route}
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate(item.route);
          }}
          activeOpacity={0.6}
          accessibilityRole="button"
          style={[styles.row, i < items.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
        >
          <View style={[styles.icon, { backgroundColor: theme.colors.primaryMuted }]}>
            <Ionicons name={item.icon} size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.main}>
            <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{item.title}</Text>
            {!!item.subtitle && <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>{item.subtitle}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12 },
});

export default ToolsCard;
