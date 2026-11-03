import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/theme';
import BottomSheet from './BottomSheet';
import { useSettings } from '../../context/SettingsContext';

/**
 * Modal de résultat (succès/erreur)
 */
const ResultModal = memo(({
  visible,
  onClose,
  success = true,
  title,
  message,
  primaryButtonText = 'OK',
  secondaryButtonText,
  onPrimaryPress,
  onSecondaryPress,
}) => {
  const theme = useTheme();
  const { t: translate } = useSettings();

  // Feedback haptique à l'ouverture
  React.useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(
        success 
          ? Haptics.NotificationFeedbackType.Success 
          : Haptics.NotificationFeedbackType.Error
      );
    }
  }, [visible, success]);

  const handlePrimaryPress = () => {
    if (onPrimaryPress) {
      onPrimaryPress();
    } else {
      onClose?.();
    }
  };

  const handleSecondaryPress = () => {
    if (onSecondaryPress) {
      onSecondaryPress();
    }
  };

  const iconName = success ? 'checkmark-circle' : 'alert-circle';
  const iconColor = success ? theme.colors.success : theme.colors.error;
  const iconBgColor = success ? theme.colors.successBg : theme.colors.errorBg;
  const defaultTitle = success ? translate('common.success') : translate('common.error');

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <View style={styles.content}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
            <Ionicons name={iconName} size={28} color={iconColor} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {title || defaultTitle}
          </Text>

          {/* Message */}
          <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
            {message}
          </Text>

          {/* Buttons */}
          {secondaryButtonText ? (
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.colors.backgroundSecondary }]}
                onPress={handleSecondaryPress}
                accessibilityRole="button"
                accessibilityLabel={secondaryButtonText}
              >
                <Text style={[styles.buttonText, { color: theme.colors.text }]}>
                  {secondaryButtonText}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.colors.primary }]}
                onPress={handlePrimaryPress}
                accessibilityRole="button"
                accessibilityLabel={primaryButtonText}
              >
                <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>
                  {primaryButtonText}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.buttonFull, { backgroundColor: theme.colors.primary }]}
              onPress={handlePrimaryPress}
              accessibilityRole="button"
              accessibilityLabel={primaryButtonText}
            >
              <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>
                {primaryButtonText}
              </Text>
            </TouchableOpacity>
          )}
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonFull: {
    width: '100%',
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

ResultModal.displayName = 'ResultModal';

export default ResultModal;
