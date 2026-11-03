import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Dimensions, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from './src/theme/theme';
import { PortfolioProvider, usePortfolio } from './src/context/PortfolioContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import { AlertsProvider } from './src/context/AlertsContext';
import { PlanningProvider } from './src/context/PlanningContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import PinLockScreen from './src/components/PinLockScreen';
import { deletePinHashSecure, clearFailedAttempts } from './src/utils/pinSecurity';

// Widget Android - uniquement sur Android avec build natif
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { PortfolioWidget, PortfolioWidgetSmall, widgetTaskHandler } = require('./src/widget');

    registerWidgetTaskHandler(async (props) => {
      await widgetTaskHandler({
        ...props,
        PortfolioWidget,
        PortfolioWidgetSmall,
      });
    });
  } catch (e) {
    // Widget non disponible (Expo Go)
    if (__DEV__) console.warn('Widget non disponible:', e.message);
  }
}

import DashboardScreen from './src/screens/DashboardScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import AddTransactionScreen from './src/screens/AddTransactionScreen';
import AssetDetailScreen from './src/screens/AssetDetailScreen';
import CashAccountScreen from './src/screens/CashAccountScreen';
import PassiveIncomeScreen from './src/screens/PassiveIncomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ProjectionScreen from './src/screens/ProjectionScreen';
import TaxScreen from './src/screens/TaxScreen';
import GoalsScreen from './src/screens/GoalsScreen';
import RebalanceScreen from './src/screens/RebalanceScreen';
import PlansScreen from './src/screens/PlansScreen';
import FeesScreen from './src/screens/FeesScreen';
import DiversificationScreen from './src/screens/DiversificationScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Fonction globale pour verrouiller en portrait
const lockPortrait = async () => {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch (e) {
    // Ignorer si non disponible
  }
};

const TabNavigator = () => {
  const theme = useTheme();
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = Dimensions.get('window');
  const isSmallDevice = screenHeight < 700;
  const tabBarHeight = (isSmallDevice ? 52 : 60) + Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 0);
  const tabBarPaddingBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 4);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          const size = focused ? 24 : 22;

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'stats-chart' : 'stats-chart-outline';
              break;
            case 'Portfolio':
              iconName = focused ? 'wallet' : 'wallet-outline';
              break;
            case 'Add':
              iconName = focused ? 'add-circle' : 'add-circle-outline';
              break;
            default:
              iconName = 'ellipse';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          height: tabBarHeight,
          paddingTop: isSmallDevice ? 4 : 6,
          paddingBottom: tabBarPaddingBottom,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: isSmallDevice ? 10 : 11,
          fontWeight: '600',
          marginTop: isSmallDevice ? 1 : 2,
        },
        headerShown: false,
        tabBarButton: (props) => {
          const { onPress, ...rest } = props;
          return (
            <TouchableOpacity
              {...rest}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress?.();
              }}
              activeOpacity={0.7}
              accessibilityRole="tab"
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: t('nav.dashboard') }}
      />
      <Tab.Screen
        name="Portfolio"
        component={PortfolioScreen}
        options={{ title: t('nav.portfolio') }}
      />
      <Tab.Screen
        name="Add"
        component={AddTransactionScreen}
        options={{ title: t('nav.add') }}
      />
    </Tab.Navigator>
  );
};

const MainNavigator = () => {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: theme.colors.background },
        gestureEnabled: true,
        animationEnabled: true,
      }}
    >
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen name="AssetDetail" component={AssetDetailScreen} />
      <Stack.Screen name="TransactionForm" component={AddTransactionScreen} />
      <Stack.Screen name="CashAccount" component={CashAccountScreen} />
      <Stack.Screen name="PassiveIncome" component={PassiveIncomeScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Projection" component={ProjectionScreen} />
      <Stack.Screen name="Tax" component={TaxScreen} />
      <Stack.Screen name="Goals" component={GoalsScreen} />
      <Stack.Screen name="Rebalance" component={RebalanceScreen} />
      <Stack.Screen name="Plans" component={PlansScreen} />
      <Stack.Screen name="Fees" component={FeesScreen} />
      <Stack.Screen name="Diversification" component={DiversificationScreen} />
    </Stack.Navigator>
  );
};

const AppContent = () => {
  const theme = useTheme();
  const { pinHash, setPinHash, biometricEnabled, t, isLoading } = useSettings();
  const { refresh: refreshPortfolio } = usePortfolio();
  const [isLocked, setIsLocked] = useState(true);
  const appState = useRef(AppState.currentState);
  const prevPinHash = useRef(pinHash);
  const initialLoadDone = useRef(false);

  /**
   * Last-resort escape hatch from the PIN lock screen. The user has already
   * passed two destructive confirmations on the lock screen; here we just
   * carry out the wipe and let the rest of the app react via context
   * reloads. We don't try to be selective — the entire app state is reset
   * to first-launch defaults.
   */
  const handleForgotPin = useCallback(async () => {
    try {
      await AsyncStorage.clear();
      await deletePinHashSecure();
      await clearFailedAttempts();
    } catch {
      // Even if individual deletions fail, we still unlock so the user is
      // not trapped. The remaining stale data will be inconsistent but
      // recoverable via another reset from Settings.
    }
    setPinHash(null);
    setIsLocked(false);
    // Force a portfolio refresh so the contexts re-read the (now empty)
    // storage instead of showing the previously cached holdings.
    try {
      await refreshPortfolio();
    } catch {
      // Ignore — the portfolio context will catch up on next render.
    }
  }, [setPinHash, refreshPortfolio]);

  // Lock orientation once at app mount. Per-screen / per-tab calls are
  // redundant because lockAsync is sticky across the entire app session.
  useEffect(() => {
    lockPortrait();
  }, []);

  // Track when initial settings load completes
  useEffect(() => {
    if (!isLoading && !initialLoadDone.current) {
      initialLoadDone.current = true;
    }
  }, [isLoading]);

  // Only skip lock for user-initiated PIN changes (not initial load)
  useEffect(() => {
    if (!initialLoadDone.current) {
      prevPinHash.current = pinHash;
      return;
    }
    if (!prevPinHash.current && pinHash) {
      setIsLocked(false);
    }
    if (prevPinHash.current && !pinHash) {
      setIsLocked(false);
    }
    prevPinHash.current = pinHash;
  }, [pinHash]);

  // Re-lock when app comes back from background (if PIN is set)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active' && pinHash) {
        setIsLocked(true);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [pinHash]);

  // Thème de navigation pour éviter le flash blanc (mémoïsé pour éviter de
  // re-rendre NavigationContainer à chaque render de AppContent)
  const navigationTheme = useMemo(() => ({
    dark: theme.isDark,
    colors: {
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.primary,
    },
  }), [theme]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <NavigationContainer theme={navigationTheme}>
        <MainNavigator />
      </NavigationContainer>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {!isLoading && pinHash && isLocked && (
        <PinLockScreen
          mode="unlock"
          currentPin={pinHash}
          biometricEnabled={biometricEnabled}
          onSuccess={(upgradedHash) => {
            // Legacy hashes are silently re-hashed on successful unlock;
            // keep our context in sync when that happens.
            if (upgradedHash && upgradedHash !== pinHash) {
              setPinHash(upgradedHash);
            }
            setIsLocked(false);
          }}
          onForgotPin={handleForgotPin}
          t={t}
          theme={theme}
        />
      )}
    </View>
  );
};

/** Wraps the app tree with ErrorBoundary; must sit inside ThemeProvider + SettingsProvider for theme and t. */
const AppWithErrorBoundary = () => {
  const theme = useTheme();
  const { t } = useSettings();

  return (
    <ErrorBoundary theme={theme} t={t}>
      <PortfolioProvider>
        <PlanningProvider>
          <AlertsProvider>
            <AppContent />
          </AlertsProvider>
        </PlanningProvider>
      </PortfolioProvider>
    </ErrorBoundary>
  );
};

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SettingsProvider>
            <AppWithErrorBoundary />
          </SettingsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
