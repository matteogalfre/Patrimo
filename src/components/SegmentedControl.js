/**
 * Sélecteur à onglets dont la pastille glisse d'une option à l'autre (léger
 * ressort). Trois habillages :
 *  - `plain` : pastille blanche bordée, posée sur le fond de page ;
 *  - `inCard` : pastille grise discrète, dans une carte ;
 *  - `track` : rail gris et pastille blanche (choix exclusif, façon iOS).
 */

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';

const SPRING = { damping: 22, stiffness: 260, mass: 0.8 };

const SegmentedControl = ({
  options,
  value,
  onChange,
  variant = 'plain',
  scrollable = false,
  fill = false,
  size = 'md',
  style,
  contentStyle,
  accessibilityRole = 'tab',
}) => {
  const theme = useTheme();
  const [layouts, setLayouts] = useState({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const shown = useSharedValue(0);

  useEffect(() => {
    const layout = layouts[String(value)];
    if (!layout) {
      shown.value = 0;
      return;
    }
    if (!shown.value) {
      // Première position : pas d'animation depuis zéro.
      x.value = layout.x;
      width.value = layout.width;
      shown.value = 1;
    } else {
      x.value = withSpring(layout.x, SPRING);
      width.value = withSpring(layout.width, SPRING);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, layouts]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    width: width.value,
    transform: [{ translateX: x.value }],
  }));

  const isTrack = variant === 'track';
  const inset = isTrack ? 3 : 0;
  const indicatorColors = variant === 'inCard'
    ? { backgroundColor: theme.colors.backgroundSecondary, borderColor: 'transparent' }
    : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border };

  const row = (
    <View
      style={[
        styles.row,
        isTrack && { backgroundColor: theme.colors.backgroundSecondary, padding: inset, borderRadius: 12 },
        fill && styles.fill,
        contentStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, { top: inset, bottom: inset }, indicatorColors, indicatorStyle]}
      />
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            onLayout={(e) => {
              const { x: left, width: w } = e.nativeEvent.layout;
              setLayouts((prev) => {
                const k = String(o.key);
                if (prev[k] && prev[k].x === left && prev[k].width === w) return prev;
                return { ...prev, [k]: { x: left, width: w } };
              });
            }}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync();
              onChange(o.key);
            }}
            style={[styles.item, size === 'sm' && styles.itemSm, fill && styles.itemFill]}
            accessibilityRole={accessibilityRole}
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.accessibilityLabel || o.label}
          >
            <Text
              style={[
                styles.text,
                size === 'sm' && styles.textSm,
                { color: active ? theme.colors.text : theme.colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollable) return <View style={style}>{row}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.scroll, style]}>
      {row}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  // Sans flexGrow: 0, un défilement horizontal placé au-dessus d'une liste
  // s'étire en hauteur.
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fill: { alignSelf: 'stretch' },
  indicator: { position: 'absolute', left: 0, borderRadius: 9, borderWidth: 1 },
  item: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  itemSm: { minHeight: 32, paddingHorizontal: 9 },
  itemFill: { flex: 1, paddingHorizontal: 4 },
  text: { fontSize: 14, fontWeight: '600' },
  textSm: { fontSize: 12 },
});

export default SegmentedControl;
