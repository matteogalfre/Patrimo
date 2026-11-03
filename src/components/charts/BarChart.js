/**
 * Histogramme simple (SVG) : une barre par période, la valeur de la barre
 * touchée affichée au-dessus. La dernière barre est sélectionnée par défaut
 * (`defaultIndex` pour en choisir une autre).
 *
 * Valeurs négatives acceptées : la ligne du zéro se place d'elle-même, les
 * barres négatives descendent et prennent `negativeColor`.
 *
 * Sans `width`, le graphique prend la largeur de son conteneur.
 */

import React, { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

const BarChart = memo(({
  data = [],
  width,
  height = 140,
  color,
  mutedColor,
  negativeColor,
  negativeMutedColor,
  baselineColor,
  textColor,
  labelColor,
  formatValue,
  defaultIndex,
}) => {
  const initial = defaultIndex ?? data.length - 1;
  const [selected, setSelected] = useState(initial);
  const [measured, setMeasured] = useState(0);
  useEffect(() => setSelected(initial), [data.length, initial]);

  if (!data.length) return null;
  const chartWidth = width > 0 ? width : measured;
  const onLayout = width > 0 ? undefined : (e) => setMeasured(e.nativeEvent.layout.width);
  if (!(chartWidth > 0)) return <View onLayout={onLayout} style={{ height }} />;
  const max = Math.max(...data.map((d) => d.value), 0);
  const min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1;
  const slot = chartWidth / data.length;
  const barWidth = Math.min(28, slot * 0.62);
  const chartHeight = height - 20;
  const zero = 2 + ((max / span) * (chartHeight - 4));
  const current = data[selected] || data[data.length - 1];

  return (
    <View onLayout={onLayout}>
      <Text style={[styles.value, { color: textColor }]}>
        {current.caption ? `${current.caption} · ` : ''}{formatValue(current.value, current)}
      </Text>
      <View style={{ width: chartWidth, height: chartHeight }}>
        <Svg width={chartWidth} height={chartHeight}>
          {min < 0 && <Line x1={0} x2={chartWidth} y1={zero} y2={zero} stroke={baselineColor || mutedColor} strokeWidth={1} />}
          {data.map((d, i) => {
            const h = Math.max(d.value !== 0 ? 3 : 1, (Math.abs(d.value) / span) * (chartHeight - 4));
            const negative = d.value < 0;
            const active = i === selected;
            const fill = negative
              ? (active ? negativeColor || color : negativeMutedColor || mutedColor)
              : (active ? color : mutedColor);
            return (
              <Rect
                key={d.label + i}
                x={i * slot + (slot - barWidth) / 2}
                y={negative ? zero : zero - h}
                width={barWidth}
                height={h}
                rx={Math.min(4, barWidth / 3)}
                fill={fill}
              />
            );
          })}
        </Svg>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.hitRow}>
            {data.map((d, i) => (
              <Pressable
                key={d.label + i}
                style={styles.hit}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelected(i);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${d.caption || d.label} ${formatValue(d.value, d)}`}
              />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text
            key={d.label + i}
            style={[styles.label, { width: slot, color: i === selected ? textColor : labelColor }]}
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
});

BarChart.displayName = 'BarChart';

const styles = StyleSheet.create({
  value: { fontSize: 13, fontWeight: '600', marginBottom: 8, fontVariant: ['tabular-nums'] },
  hitRow: { flex: 1, flexDirection: 'row' },
  hit: { flex: 1 },
  labels: { flexDirection: 'row', marginTop: 6 },
  label: { fontSize: 10, textAlign: 'center' },
});

export default BarChart;
