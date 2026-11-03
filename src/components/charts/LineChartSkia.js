/**
 * Courbe Skia (victory-native) partagée par le tableau de bord et les fiches.
 *
 *  - ligne fine et remplissage léger ;
 *  - seconde série facultative (`y2`) en pointillés, pour l'argent investi ;
 *  - séries supplémentaires facultatives (`series` : clé, couleur), tracées
 *    en lignes pleines, par exemple plusieurs scénarios côte à côte ;
 *  - on pose le doigt et on glisse : un repère suit le doigt, chaque
 *    changement de point vibre légèrement et est remonté par `onScrub` (index
 *    du point, ou -1 au relâchement) pour que l'écran affiche la valeur ;
 *  - marqueurs facultatifs (achats, ventes), touchables.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import {
  Circle,
  DashPathEffect,
  Line as SkiaLine,
  matchFont,
  LinearGradient,
  vec,
} from '@shopify/react-native-skia';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import { useAnimatedReaction, useDerivedValue, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const FONT_FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const LABEL_FONT_SIZE = 10;

/**
 * Interpolation linéaire identique à l'échelle de victory-native : sert à
 * placer les zones tactiles des marqueurs au-dessus du canvas.
 */
const linearScale = (value, domainMin, domainMax, rangeMin, rangeMax) => {
  if (domainMax === domainMin) return (rangeMin + rangeMax) / 2;
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
};

/** Repère vertical et point suivant le doigt, dessinés dans Skia. */
const ScrubCursor = ({ state, top, bottom, color, ringColor }) => {
  const p1 = useDerivedValue(() => vec(state.x.position.value, top));
  const p2 = useDerivedValue(() => vec(state.x.position.value, bottom));
  return (
    <>
      <SkiaLine p1={p1} p2={p2} color={color} strokeWidth={1} opacity={0.5} />
      <Circle cx={state.x.position} cy={state.y.y.position} r={6} color={ringColor} />
      <Circle cx={state.x.position} cy={state.y.y.position} r={4} color={color} />
    </>
  );
};

const LineChartSkia = ({
  data,
  width,
  height,
  color,
  secondaryColor,
  theme,
  xLabels = [],
  yTickCount = 4,
  formatYLabel = (v) => String(Math.round(v)),
  markers = {},
  onMarkerPress,
  onScrub,
  selectedIndex = null,
  curve = 'linear',
  showArea = true,
  domainPadding,
  series = [],
}) => {
  const font = useMemo(() => matchFont({ fontFamily: FONT_FAMILY, fontSize: LABEL_FONT_SIZE }), []);
  const hasSecondary = data.length > 0 && data.every((d) => Number.isFinite(d.y2));
  const extraKeys = series.map((s) => s.key);
  const yKeys = [...(hasSecondary ? ['y', 'y2'] : ['y']), ...extraKeys];
  const { state, isActive } = useChartPressState({ x: 0, y: { y: 0, y2: 0 } });

  // Le point sous le doigt remonte au JS uniquement quand il change.
  const handleScrub = useCallback((index) => {
    if (index >= 0) Haptics.selectionAsync();
    onScrub?.(index);
  }, [onScrub]);
  // Un booléen, pas la fonction : le worklet ne doit capturer que des valeurs.
  const scrubEnabled = !!onScrub;
  useAnimatedReaction(
    () => (state.isActive.value ? state.matchedIndex.value : -1),
    (index, previous) => {
      if (scrubEnabled && index !== previous) runOnJS(handleScrub)(index);
    },
    [handleScrub, scrubEnabled],
  );

  const xTickValues = useMemo(() => {
    const ticks = xLabels
      .map((entry, i) => ({ i, label: typeof entry === 'string' ? entry : entry?.label }))
      .filter((e) => e.label)
      .map((e) => e.i);
    if (data.length > 0) {
      if (!ticks.includes(0)) ticks.unshift(0);
      const last = data.length - 1;
      if (!ticks.includes(last)) ticks.push(last);
    }
    return Array.from(new Set(ticks)).sort((a, b) => a - b);
  }, [xLabels, data.length]);

  const labelByIndex = useMemo(() => {
    const map = {};
    xLabels.forEach((entry, i) => {
      const label = typeof entry === 'string' ? entry : entry?.label;
      if (label) map[i] = label;
    });
    return map;
  }, [xLabels]);

  const formatXLabel = useCallback((value) => labelByIndex[value] ?? '', [labelByIndex]);

  const [bounds, setBounds] = useState(null);

  const yDomain = useMemo(() => {
    if (!data.length) return null;
    const values = data
      .flatMap((d) => [d.y, ...(hasSecondary ? [d.y2] : []), ...extraKeys.map((k) => d[k])])
      .filter((v) => Number.isFinite(v));
    if (!values.length) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return [min - 1, max + 1];
    return [min, max];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, hasSecondary, extraKeys.join()]);

  const markerPositions = useMemo(() => {
    if (!bounds || !data.length || !yDomain) return [];
    const [yMin, yMax] = yDomain;
    const positions = [];
    Object.entries(markers).forEach(([idxStr, marker]) => {
      const idx = Number(idxStr);
      const datum = data[idx];
      if (!datum || !Number.isFinite(datum.y)) return;
      const x = linearScale(idx, 0, data.length - 1, bounds.left, bounds.right);
      const y = linearScale(datum.y, yMin, yMax, bounds.bottom, bounds.top);
      positions.push({ index: idx, x, y, marker });
    });
    return positions;
  }, [bounds, data, yDomain, markers]);

  if (!data.length) return null;

  const lineColor = color || theme.colors.primary;
  const effectivePadding = domainPadding ?? { left: 8, right: 12, top: 16, bottom: 4 };

  return (
    <View style={{ width, height }}>
      <CartesianChart
        data={data}
        xKey="x"
        yKeys={yKeys}
        domainPadding={effectivePadding}
        domain={{ y: yDomain ?? undefined }}
        onChartBoundsChange={(b) => setBounds(b)}
        chartPressState={onScrub ? state : undefined}
        xAxis={{
          font,
          tickValues: xTickValues,
          formatXLabel,
          labelColor: theme.colors.textTertiary,
          lineColor: theme.colors.border,
          lineWidth: 0,
          labelOffset: 6,
        }}
        yAxis={[
          {
            font,
            tickCount: yTickCount,
            formatYLabel,
            labelColor: theme.colors.textTertiary,
            lineColor: theme.colors.borderLight,
            lineWidth: 1,
            labelOffset: 6,
          },
        ]}
      >
        {({ points, chartBounds }) => (
          <>
            {showArea && (
              <Area
                points={points.y}
                y0={chartBounds.bottom}
                curveType={curve}
                animate={{ type: 'timing', duration: 300 }}
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[`${lineColor}30`, `${lineColor}00`]}
                />
              </Area>
            )}

            {hasSecondary && (
              <Line
                points={points.y2}
                color={secondaryColor || theme.colors.textTertiary}
                strokeWidth={1.25}
                curveType={curve}
                animate={{ type: 'timing', duration: 300 }}
              >
                <DashPathEffect intervals={[4, 4]} />
              </Line>
            )}

            {series.map((s) => (
              <Line
                key={s.key}
                points={points[s.key]}
                color={s.color}
                strokeWidth={s.width || 1.75}
                curveType={curve}
                animate={{ type: 'timing', duration: 300 }}
              />
            ))}

            <Line
              points={points.y}
              color={lineColor}
              strokeWidth={1.75}
              curveType={curve}
              animate={{ type: 'timing', duration: 300 }}
            />

            {points.y.map((p, i) => {
              const marker = markers[i];
              if (!marker || p.y == null) return null;
              const isSelected = selectedIndex === i;
              return (
                <React.Fragment key={`marker-${i}`}>
                  <Circle cx={p.x} cy={p.y} r={marker.radius} color={marker.fill || theme.colors.surface} />
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={marker.radius}
                    color={marker.stroke || (marker.isSell ? theme.colors.error : theme.colors.success)}
                    style="stroke"
                    strokeWidth={isSelected ? 3 : 2}
                  />
                </React.Fragment>
              );
            })}

            {onScrub && isActive && (
              <ScrubCursor
                state={state}
                top={chartBounds.top}
                bottom={chartBounds.bottom}
                color={lineColor}
                ringColor={theme.colors.surface}
              />
            )}
          </>
        )}
      </CartesianChart>

      {/* Zones tactiles des marqueurs, au-dessus du canvas : 44 pt minimum. */}
      {onMarkerPress &&
        markerPositions.map(({ index, x, y, marker }) => {
          const hitSize = Math.max(44, marker.radius * 2 + 24);
          return (
            <TouchableOpacity
              key={`hit-${index}`}
              style={[
                styles.hitZone,
                {
                  left: x - hitSize / 2,
                  top: y - hitSize / 2,
                  width: hitSize,
                  height: hitSize,
                  borderRadius: hitSize / 2,
                },
              ]}
              activeOpacity={0.7}
              onPress={() => onMarkerPress(index, { x, y })}
              accessibilityRole="button"
              accessibilityLabel={marker.accessibilityLabel || `Point ${index}`}
            />
          );
        })}
    </View>
  );
};

const styles = StyleSheet.create({
  hitZone: {
    position: 'absolute',
    zIndex: 100,
  },
});

/**
 * Convertit `{ labels, datasets: [{ data }, { data }?] }` en points
 * `{ x, y, y2? }` attendus par victory-native.
 */
export const toLineChartData = (legacyData) => {
  const labels = legacyData?.labels ?? [];
  const series = legacyData?.datasets?.[0]?.data ?? [];
  const second = legacyData?.datasets?.[1]?.data ?? null;
  const data = series.map((y, i) => {
    const point = { x: i, y: Number.isFinite(y) ? y : 0 };
    if (second) point.y2 = Number.isFinite(second[i]) ? second[i] : 0;
    return point;
  });
  return { data, xLabels: labels };
};

export default LineChartSkia;
