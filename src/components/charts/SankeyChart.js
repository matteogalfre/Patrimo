/**
 * Diagramme de Sankey du budget, en quatre colonnes : les revenus, le
 * budget, les catégories, les postes. L'épaisseur d'un flux est son montant.
 *
 * Nœuds de 8 px aux bouts arrondis, 6 px de vide entre un nœud et ses flux,
 * flux pleins qui partent collés et s'écartent vers des nœuds espacés de
 * 10 px, palette pastel chaude (autour de l'orange de Patrimo) parcourue
 * colonne par colonne, pastilles claires « Loyer : 500 € ». Le diagramme garde
 * une largeur confortable et se fait glisser sur un téléphone. Dessiné en
 * Skia, étiquettes en texte natif ; toucher une étiquette met son chemin en avant.
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Canvas, Group, Path, RoundedRect, rect } from '@shopify/react-native-skia';
import Animated, { Easing, FadeIn, useAnimatedStyle, useDerivedValue, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { linkPath, SANKEY_LINK_GAP as LINK_GAP, SANKEY_NODE_WIDTH as NODE_WIDTH, sankeyLayout } from '../../core/budget';

/** Largeur minimale du diagramme : en dessous, il se fait glisser. */
export const MIN_WIDTH = 700;
export const PILL = 18;
const SIDE = 16;
// Espace entre deux nœuds d'une même colonne.
export const NODE_GAP = 10;

/** Bande d'un flux : pleine, collée à ses voisines au départ. */
export const bandPath = (l) => linkPath(l);

/** Un nœud : au moins un rond de la largeur du trait, centré sur son flux. */
export const nodeBox = (n) => {
  const h = Math.max(n.h, NODE_WIDTH);
  return { x: n.x, y: n.y + n.h / 2 - h / 2, width: NODE_WIDTH, height: h, r: NODE_WIDTH / 2 };
};

// Palette pastel de Patrimo, chaude, autour de son orange : le n-ième nœud de
// la colonne c prend la teinte c + n (revenu abricot, budget sable, première
// catégorie sauge…).
export const COLORS = {
  palette: [
    '#F2C3A0', '#E8D5B5', '#C9D6B8', '#B9CFD9', '#E3B7A8', '#D9CBE0',
    '#F4DDB8', '#BFD8CC', '#E6C9B8', '#CBD3E6', '#EFD0C4', '#D8E2C3',
  ],
  expenseFlow: '#EFE6DA',
};
export const PILL_COLORS = { background: '#F1EEEA', text: '#1B1A19' };

/** Largeur probable d'une pastille (texte de 11 px), pour réserver la place. */
const pillWidth = (text) => String(text).length * 6.3 + 14;

/**
 * Les textes des pastilles et la place qu'il faut entre revenus et budget
 * pour que leurs étiquettes, face à face, ne se chevauchent pas.
 */
export const sankeyLabels = (budget, { labels, money }) => {
  const incomes = (budget?.incomes || []).filter((x) => Number(x.amount) > 0);
  const flow = Math.max(
    incomes.reduce((s, x) => s + Number(x.amount), 0),
    (budget?.groups || []).reduce((s, g) => s + g.items.reduce((a, it) => a + (Number(it.amount) > 0 ? Number(it.amount) : 0), 0), 0),
  );
  const incomeText = (x) => `${x.label} : ${money(Number(x.amount))}`;
  const budgetText = `${labels.budget} : ${money(flow)}`;
  const widest = Math.max(0, ...incomes.map((x) => pillWidth(incomeText(x))));
  return { budgetText, minFirstSpan: widest + pillWidth(budgetText) + NODE_WIDTH + 2 * (LINK_GAP + 6) + 12 };
};

/** Le chemin d'un nœud : ses flux et ses nœuds, en amont et en aval. */
const pathOf = (links, id) => {
  if (!id) return null;
  const path = { links: new Set(), nodes: new Set([id]) };
  const walk = (n, from, to) => links.filter((l) => l[from] === n).forEach((l) => {
    path.links.add(l.id);
    path.nodes.add(l[to]);
    walk(l[to], from, to);
  });
  walk(id, 'target', 'source');
  walk(id, 'source', 'target');
  return path;
};

/**
 * @param {{budget: object, width: number, theme: object, formatAmount: Function, labels: {budget: string, available: string}, selected?: string, onSelect?: Function}} props
 *   width : largeur visible ; le diagramme s'étend au-delà si besoin
 */
const SankeyChart = ({ budget, width, theme, formatAmount, labels, selected, onSelect }) => {
  const chartWidth = Math.max(MIN_WIDTH, width - SIDE * 2);
  const money = (v) => formatAmount(v, { decimals: 0 });
  const { minFirstSpan } = sankeyLabels(budget, { labels, money });
  const layout = useMemo(
    () => sankeyLayout(budget, { width: chartWidth, colors: COLORS, slot: PILL + 2, gap: NODE_GAP, minFirstSpan }),
    [budget, chartWidth, minFirstSpan],
  );
  const { height } = layout;
  const highlight = useMemo(() => pathOf(layout.links, selected), [layout.links, selected]);
  const dark = theme.isDark;

  // Les flux se déroulent de gauche à droite, une fois, à l'ouverture.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [progress]);
  const clip = useDerivedValue(() => rect(0, 0, chartWidth * progress.value, height));

  // Glisser du doigt pour voir la suite, comme les curseurs de l'app : un
  // geste horizontal fait défiler le diagramme, un geste vertical la page.
  const contentWidth = chartWidth + SIDE * 2;
  const maxShift = Math.max(0, contentWidth - width);
  const shift = useSharedValue(0);
  const startShift = useSharedValue(0);
  const pan = Gesture.Pan()
    .enabled(maxShift > 0)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart(() => {
      startShift.value = shift.value;
    })
    .onUpdate((e) => {
      shift.value = Math.min(0, Math.max(-maxShift, startShift.value + e.translationX));
    })
    .onEnd((e) => {
      shift.value = withDecay({ velocity: e.velocityX, clamp: [-maxShift, 0] });
    });
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));
  const thumbWidth = maxShift > 0 ? Math.max(40, (width / contentWidth) * (width - SIDE * 2)) : 0;
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: maxShift > 0 ? (-shift.value / maxShift) * (width - SIDE * 2 - thumbWidth) : 0 }],
  }));

  if (!layout.nodes.length) return null;

  const budgetNode = layout.nodes.find((n) => n.id === '__budget');
  const select = (id) => {
    Haptics.selectionAsync();
    onSelect?.(selected === id ? null : id);
  };
  const dimmed = (id) => !!highlight && !highlight.nodes.has(id);
  const flowOpacity = 1;

  const pill = (id, text, position, active) => (
    <Pressable
      key={id}
      onPress={() => select(id)}
      hitSlop={6}
      style={[
        styles.pill,
        position,
        { borderColor: active ? theme.colors.primary : dark ? 'transparent' : 'rgba(25, 25, 31, 0.12)', opacity: dimmed(id) ? 0.35 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={text}
    >
      <Text style={styles.pillText} numberOfLines={1}>{text}</Text>
    </Pressable>
  );
  const nameOf = (n) => (n.id === '__available' ? labels.available : n.label);

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View style={[styles.viewport, { width }]}>
          <Animated.View style={[styles.slide, { width: contentWidth }, slideStyle]}>
            <View style={{ width: chartWidth, height }}>
              {/* Le dessin ne prend pas le doigt : le glissement revient au geste de défilement. */}
              <View pointerEvents="none">
                <Canvas style={{ width: chartWidth, height }}>
                  <Group clip={clip}>
                    {layout.links.map((l) => (
                      <Path
                        key={l.id}
                        path={bandPath(l)}
                        color={l.color}
                        opacity={highlight && !highlight.links.has(l.id) ? 0.2 : flowOpacity}
                      />
                    ))}
                    {layout.nodes.map((n) => {
                      const box = nodeBox(n);
                      return (
                        <RoundedRect key={n.id} x={box.x} y={box.y} width={box.width} height={box.height} r={box.r} color={n.color} opacity={dimmed(n.id) ? 0.35 : 1} />
                      );
                    })}
                  </Group>
                </Canvas>
              </View>

              <Animated.View entering={FadeIn.delay(500).duration(400)} style={StyleSheet.absoluteFill} pointerEvents="box-none">
                {/* Revenus et budget : dans le flux qui les relie, à gauche et à droite. */}
                {layout.nodes.filter((n) => n.column === 0).map((n) => pill(
                  n.id,
                  `${n.label} : ${money(n.value)}`,
                  { top: n.y + n.h / 2 - PILL / 2, left: n.x + NODE_WIDTH + LINK_GAP + 6 },
                  selected === n.id,
                ))}
                {pill(
                  budgetNode.id,
                  `${labels.budget} : ${money(budgetNode.value)}`,
                  { top: budgetNode.y + budgetNode.h / 2 - PILL / 2, right: chartWidth - budgetNode.x + LINK_GAP + 6 },
                  selected === budgetNode.id,
                )}
                {/* Catégories et postes : contre leur nœud, à gauche. */}
                {layout.nodes.filter((n) => n.column >= 2).map((n) => pill(
                  n.id,
                  `${nameOf(n)} : ${money(n.value)}`,
                  { top: n.y + n.h / 2 - PILL / 2, right: chartWidth - n.x + LINK_GAP + 4 },
                  selected === n.id,
                ))}
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      </GestureDetector>
      {maxShift > 0 && (
        <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
          <Animated.View style={[styles.thumb, { width: thumbWidth, backgroundColor: theme.colors.textTertiary }, thumbStyle]} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  slide: { paddingHorizontal: SIDE },
  track: { height: 4, borderRadius: 2, marginHorizontal: SIDE, marginTop: 10, overflow: 'hidden' },
  thumb: { height: 4, borderRadius: 2 },
  pill: {
    position: 'absolute',
    height: PILL,
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: PILL_COLORS.background,
  },
  pillText: { fontSize: 11, color: PILL_COLORS.text, fontVariant: ['tabular-nums'] },
});

export default SankeyChart;
