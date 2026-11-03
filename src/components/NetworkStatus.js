import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { SlideInUp, SlideOutUp, FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/theme';
import { getLocaleTag } from '../i18n';

/**
 * Composant affichant le statut de connexion réseau
 */
const NetworkStatus = memo(({ isOffline, style, t }) => {
  const theme = useTheme();

  if (!isOffline) return null;

  return (
    <Animated.View
      entering={SlideInUp.duration(300)}
      exiting={SlideOutUp.duration(300)}
      style={[
        styles.container,
        { backgroundColor: theme.colors.warning },
        style,
      ]}
    >
      <Ionicons name="cloud-offline" size={16} color={theme.colors.onWarning} />
      <Text style={[styles.text, { color: theme.colors.onWarning }]}>
        {t ? t('network.offline') : 'Offline mode'}
      </Text>
    </Animated.View>
  );
});

/**
 * Composant affichant une erreur avec option de retry
 */
export const ErrorBanner = memo(({ message, onRetry, style, t }) => {
  const theme = useTheme();

  if (!message) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.errorContainer,
        { backgroundColor: theme.colors.errorBg, borderColor: theme.colors.error },
        style,
      ]}
    >
      <View style={styles.errorContent}>
        <Ionicons name="alert-circle" size={18} color={theme.colors.error} />
        <Text style={[styles.errorText, { color: theme.colors.error }]} numberOfLines={2}>
          {message}
        </Text>
      </View>
      {onRetry && (
        <Animated.View entering={FadeIn.delay(100)}>
          <Pressable
            onPress={onRetry}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel={t ? t('network.retry') : 'Retry'}
          >
            <Text style={[styles.retryText, { color: theme.colors.error }]}>
              {t ? t('network.retry') : 'Retry'}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
});

/**
 * Composant affichant le statut de chargement/synchronisation
 */
export const SyncStatus = memo(({ isSyncing, lastUpdated, style, t, language }) => {
  const theme = useTheme();

  if (!lastUpdated && !isSyncing) return null;

  return (
    <View style={[styles.syncContainer, style]}>
      {isSyncing ? (
        <View style={styles.syncContent}>
          <Ionicons name="sync" size={12} color={theme.colors.textTertiary} />
          <Text style={[styles.syncText, { color: theme.colors.textTertiary }]}>
            {t ? t('network.syncing') : 'Syncing...'}
          </Text>
        </View>
      ) : lastUpdated ? (
        <Text style={[styles.syncText, { color: theme.colors.textTertiary }]}>
          {t ? t('network.updatedAt', { time: new Date(lastUpdated).toLocaleTimeString(getLocaleTag(language), { hour: '2-digit', minute: '2-digit' }) }) : `Updated at ${new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  syncContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  syncContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  syncText: {
    fontSize: 11,
  },
});

NetworkStatus.displayName = 'NetworkStatus';
ErrorBanner.displayName = 'ErrorBanner';
SyncStatus.displayName = 'SyncStatus';

export default NetworkStatus;
