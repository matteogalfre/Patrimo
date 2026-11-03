import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../theme/theme';

const SkeletonLoader = ({ width = '100%', height = 20, borderRadius, style }) => {
  const theme = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.5, 0.3]);
    return { opacity };
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        animatedStyle,
        {
          width,
          height,
          borderRadius: borderRadius ?? 8,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    />
  );
};

export const MetricCardSkeleton = ({ style }) => {
  const theme = useTheme();
  
  return (
    <View style={[
      styles.metricCard,
      { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      style,
    ]}>
      <SkeletonLoader width={36} height={36} borderRadius={10} />
      <SkeletonLoader width={70} height={12} style={{ marginTop: 12, marginBottom: 6 }} />
      <SkeletonLoader width="60%" height={20} style={{ marginBottom: 6 }} />
      <SkeletonLoader width={50} height={16} borderRadius={6} />
    </View>
  );
};

export const CryptoCardSkeleton = ({ style }) => {
  const theme = useTheme();
  
  return (
    <View style={[
      styles.cryptoCard,
      { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      style,
    ]}>
      <View style={styles.cryptoHeader}>
        <View style={styles.cryptoInfo}>
          <SkeletonLoader width={38} height={38} borderRadius={10} />
          <View style={{ marginLeft: 10 }}>
            <SkeletonLoader width={45} height={14} style={{ marginBottom: 4 }} />
            <SkeletonLoader width={70} height={12} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <SkeletonLoader width={60} height={14} style={{ marginBottom: 4 }} />
          <SkeletonLoader width={45} height={20} borderRadius={6} />
        </View>
      </View>
      <View style={styles.cryptoStats}>
        <SkeletonLoader width={50} height={12} />
        <SkeletonLoader width={50} height={12} />
        <SkeletonLoader width={50} height={12} />
        <SkeletonLoader width={50} height={12} />
      </View>
    </View>
  );
};

export const ChartSkeleton = ({ height = 200, style }) => {
  const theme = useTheme();
  
  return (
    <View style={[
      styles.chartContainer,
      { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, height },
      style,
    ]}>
      <View style={styles.chartHeader}>
        <SkeletonLoader width={100} height={16} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <SkeletonLoader width={32} height={24} borderRadius={8} />
          <SkeletonLoader width={32} height={24} borderRadius={8} />
          <SkeletonLoader width={32} height={24} borderRadius={8} />
        </View>
      </View>
      <View style={styles.chartArea}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.chartLine, { backgroundColor: theme.colors.border }]} />
        ))}
      </View>
    </View>
  );
};

export const PortfolioHeaderSkeleton = ({ style }) => {
  const theme = useTheme();
  
  return (
    <View style={[
      styles.portfolioHeader,
      { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      style,
    ]}>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <SkeletonLoader width={80} height={12} style={{ marginBottom: 8 }} />
        <SkeletonLoader width={150} height={32} />
      </View>
      <View style={styles.portfolioStats}>
        <View style={{ alignItems: 'center' }}>
          <SkeletonLoader width={40} height={10} style={{ marginBottom: 6 }} />
          <SkeletonLoader width={60} height={16} />
        </View>
        <View style={{ alignItems: 'center' }}>
          <SkeletonLoader width={40} height={10} style={{ marginBottom: 6 }} />
          <SkeletonLoader width={60} height={16} />
        </View>
        <View style={{ alignItems: 'center' }}>
          <SkeletonLoader width={40} height={10} style={{ marginBottom: 6 }} />
          <SkeletonLoader width={60} height={16} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
  metricCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cryptoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cryptoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cryptoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cryptoStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  chartLine: {
    height: 1,
    width: '100%',
  },
  portfolioHeader: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  portfolioStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});

export default SkeletonLoader;
