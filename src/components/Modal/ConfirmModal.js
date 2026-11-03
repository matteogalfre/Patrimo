import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/theme';
import BottomSheet from './BottomSheet';
import { useSettings } from '../../context/SettingsContext';

/**
 * Modal de confirmation avec icône et boutons
 */
const ConfirmModal = memo(({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  confirmColor, // 'primary', 'error', 'success'
  icon = 'alert-circle',
  iconColor, // Couleur de l'icône
  destructive = false,
  loading = false,
}) => {
  const theme = useTheme();
  const { t: translate } = useSettings();
  const effectiveConfirmText = confirmText || translate('common.confirm');
  const effectiveCancelText = cancelText || translate('common.cancel');

  const getButtonColor = () => {
    if (confirmColor) {
      return theme.colors[confirmColor] || confirmColor;
    }
    return destructive ? theme.colors.error : theme.colors.primary;
  };

  // Texte/icône posé SUR le bouton de confirmation. On mappe vers le bon token
  // `onX` selon la couleur de fond pour garantir le contraste WCAG AA, au lieu
  // d'un noir/blanc codé en dur.
  const confirmTextColor = (() => {
    if (destructive) return theme.colors.onError;
    switch (confirmColor) {
      case 'error':
        return theme.colors.onError;
      case 'success':
        return theme.colors.onSuccess;
      case 'accent':
        return theme.colors.onAccent;
      default:
        return theme.colors.onPrimary;
    }
  })();

  const getIconColor = () => {
    if (iconColor) {
      return theme.colors[iconColor] || iconColor;
    }
    return destructive ? theme.colors.error : theme.colors.warning;
  };

  const getIconBgColor = () => {
    if (destructive) {
      return theme.colors.errorBg;
    }
    return theme.colors.warningBg;
  };

  const handleConfirm = () => {
    Haptics.notificationAsync(
      destructive 
        ? Haptics.NotificationFeedbackType.Warning 
        : Haptics.NotificationFeedbackType.Success
    );
    onConfirm?.();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <View style={styles.content}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: getIconBgColor() }]}>
            <Ionicons name={icon} size={28} color={getIconColor()} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>

          {/* Message */}
          <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
            {message}
          </Text>

          {/* Buttons */}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.colors.backgroundSecondary }]}
              onPress={onClose}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={effectiveCancelText}
            >
              <Text style={[styles.buttonText, { color: theme.colors.text }]}>
                {effectiveCancelText}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: getButtonColor() }]}
              onPress={handleConfirm}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={effectiveConfirmText}
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <Text style={[styles.buttonText, { color: confirmTextColor }]}>
                  ...
                </Text>
              ) : (
                <>
                  {destructive && (
                    <Ionicons 
                      name="trash-outline" 
                      size={16} 
                      color={confirmTextColor} 
                      style={{ marginRight: 6 }} 
                    />
                  )}
                  <Text style={[styles.buttonText, { color: confirmTextColor }]}>
                    {effectiveConfirmText}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingTop: 4,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

ConfirmModal.displayName = 'ConfirmModal';

export default ConfirmModal;
