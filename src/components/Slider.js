/**
 * Curseur : on le fait glisser ou on touche la piste pour sauter à une
 * valeur. Il avance par crans (`step`) avec un léger retour haptique à chaque
 * cran, et reste utilisable au lecteur d'écran (augmenter / diminuer).
 *
 * Un glissement vertical ne le déclenche pas : la page reste défilable.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';

const THUMB = 26;

const Slider = ({ value, min = 0, max = 100, step = 1, onChange, color, accessibilityLabel, formatValue }) => {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const dragging = useSharedValue(0);
  const last = useRef(value);
  const accent = color || theme.colors.primary;

  const ratioOf = (v) => (max > min ? (v - min) / (max - min) : 0);

  // Le curseur suit la valeur quand elle change d'ailleurs (et au premier rendu).
  useEffect(() => {
    last.current = value;
    if (width > 0 && !dragging.value) x.value = withTiming(ratioOf(value) * width, { duration: 120 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, width]);

  const emit = useCallback((v) => {
    if (v === last.current) return;
    last.current = v;
    Haptics.selectionAsync();
    onChange(v);
  }, [onChange]);

  const snap = (px) => {
    'worklet';
    const ratio = width > 0 ? Math.min(1, Math.max(0, px / width)) : 0;
    const raw = min + ratio * (max - min);
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };

  const move = (px) => {
    'worklet';
    const clamped = Math.min(width, Math.max(0, px));
    x.value = clamped;
    runOnJS(emit)(snap(clamped));
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      dragging.value = 1;
      move(e.x - THUMB / 2);
    })
    .onUpdate((e) => move(e.x - THUMB / 2))
    .onFinalize(() => {
      dragging.value = 0;
      // Le curseur se cale sur le cran retenu.
      const v = snap(x.value);
      x.value = withTiming(((v - min) / (max - min || 1)) * width, { duration: 100 });
    });

  const tap = Gesture.Tap().onEnd((e) => {
    const v = snap(e.x - THUMB / 2);
    x.value = withTiming(((v - min) / (max - min || 1)) * width, { duration: 120 });
    runOnJS(emit)(v);
  });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        style={styles.hit}
        onLayout={(e) => setWidth(Math.max(0, e.nativeEvent.layout.width - THUMB))}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value, text: formatValue ? formatValue(value) : String(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = e.nativeEvent.actionName === 'increment' ? value + step : value - step;
          emit(Math.min(max, Math.max(min, next)));
        }}
      >
        <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
          <Animated.View style={[styles.fill, { backgroundColor: accent }, fillStyle]} />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { backgroundColor: theme.colors.surface, borderColor: accent }, thumbStyle]}
        />
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  hit: { height: 40, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, marginHorizontal: THUMB / 2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});

export default Slider;
