import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/theme';
import BottomSheet from './BottomSheet';

/**
 * Fenêtre de base : une feuille qui monte du bas, avec titre et bouton de
 * fermeture facultatifs.
 */
const BaseModal = memo(({
  visible,
  onClose,
  title,
  children,
  showCloseButton = true,
  closeOnBackdrop = true,
  style,
}) => {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} closeOnBackdrop={closeOnBackdrop} style={style}>
      {(title || showCloseButton) && (
        <View style={styles.header}>
          {title && <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>}
          {showCloseButton && (
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: theme.colors.backgroundSecondary }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
            >
              <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}
      {children}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

BaseModal.displayName = 'BaseModal';

export default BaseModal;
