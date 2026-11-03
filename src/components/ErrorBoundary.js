import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { recordCrash } from '../services/crashLog';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });

    if (__DEV__) console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Persiste l'erreur pour qu'elle survive au redemarrage : en production,
    // c'est la seule trace disponible (aucune telemetrie, rien ne sort de
    // l'appareil). Consultable depuis les reglages.
    recordCrash(error, errorInfo);
  }

  handleRetry = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback
        error={this.state.error}
        onRetry={this.handleRetry}
        theme={this.props.theme}
        t={this.props.t}
      />;
    }

    return this.props.children;
  }
}

const ErrorFallback = ({ error, onRetry, theme, t }) => {
  const currentTheme = theme || { colors: {} };

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors?.background || '#000' }]}>
      <View style={[styles.errorCard, { backgroundColor: currentTheme.colors?.surface || '#1a1a1a', borderColor: currentTheme.colors?.border || '#333' }]}>
        <View style={[styles.errorIcon, { backgroundColor: currentTheme.colors?.errorBg || '#ff4444' }]}>
          <Ionicons name="alert-circle" size={40} color={currentTheme.colors?.error || '#ff4444'} />
        </View>

        <Text style={[styles.errorTitle, { color: currentTheme.colors?.text || '#fff' }]}>
          {(t ? t('errorBoundary.title') : 'Oops! Something went wrong')}
        </Text>

        <Text style={[styles.errorMessage, { color: currentTheme.colors?.textSecondary || '#ccc' }]}>
          {(t ? t('errorBoundary.message') : 'The app encountered an unexpected problem. You can try reloading or contact support if the issue persists.')}
        </Text>

        {__DEV__ && error && (
          <View style={styles.devInfo}>
            <Text style={[styles.devTitle, { color: currentTheme.colors?.text || '#fff' }]}>
              {(t ? t('errorBoundary.devInfo') : 'Developer info:')}
            </Text>
            <Text style={[styles.devError, { color: currentTheme.colors?.error || '#ff4444' }]}>
              {error.toString()}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: currentTheme.colors?.primary || '#007AFF' }]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t ? t('errorBoundary.retry') : 'Retry'}
        >
          <Ionicons name="refresh" size={20} color={currentTheme.colors?.onPrimary || '#000'} />
          <Text style={[styles.retryButtonText, { color: currentTheme.colors?.onPrimary || '#000' }]}>
            {(t ? t('errorBoundary.retry') : 'Retry')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
  },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  devInfo: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  devTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  devError: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ErrorBoundary;