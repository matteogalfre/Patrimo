/**
 * Export du diagramme de budget en image PNG, à partager. Le diagramme est
 * redessiné hors écran, en entier (pas seulement la partie visible), avec
 * ses étiquettes, un titre et le taux d'épargne, en double résolution.
 * Les formes sont agrandies d'un bloc ; le texte, lui, est tracé directement
 * à sa taille finale (agrandi après coup, ses lettres s'espaçaient mal).
 */

import React from 'react';
import { Platform } from 'react-native';
import { drawAsImage, Group, matchFont, Path, Rect, RoundedRect, Text } from '@shopify/react-native-skia';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { SANKEY_LINK_GAP as LINK_GAP, SANKEY_NODE_WIDTH as NODE_WIDTH, sankeyLayout } from '../../core/budget';
import { bandPath, COLORS, MIN_WIDTH, NODE_GAP, nodeBox, PILL, PILL_COLORS, sankeyLabels } from './SankeyChart';

const FONT_FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const SCALE = 2;
const MARGIN = 24;
const HEADER = 76;
const FOOTER = 34;

/**
 * @param {{budget: object, title: string, subtitle: string, footer: string, labels: {budget: string, available: string}, formatAmount: Function, dark: boolean}} params
 * @returns {Promise<boolean>} faux si le partage n'est pas disponible
 */
export const shareSankeyImage = async ({ budget, title, subtitle, footer, labels, formatAmount, dark }) => {
  const width = MIN_WIDTH;
  const { minFirstSpan } = sankeyLabels(budget, { labels, money: (v) => formatAmount(v, { decimals: 0 }) });
  const layout = sankeyLayout(budget, { width, colors: COLORS, slot: PILL + 2, gap: NODE_GAP, minFirstSpan });
  if (!layout.nodes.length) throw new Error('EMPTY');

  const W = width + MARGIN * 2;
  const H = HEADER + layout.height + FOOTER;
  const k = SCALE;
  const bg = dark ? '#19191E' : '#FFFFFF';
  const text = dark ? '#F2F2F4' : '#1A1A1E';
  const sub = dark ? '#A0A3AB' : '#6B6F78';
  // Polices à la taille finale (× 2) : un texte agrandi après coup s'espace mal.
  const titleFont = matchFont({ fontFamily: FONT_FAMILY, fontSize: 20 * k, fontWeight: 'bold' });
  const subFont = matchFont({ fontFamily: FONT_FAMILY, fontSize: 12 * k });
  const pillFont = matchFont({ fontFamily: FONT_FAMILY, fontSize: 11 * k });
  const money = (v) => formatAmount(v, { decimals: 0 });
  const widthOf = (font, str) => font.measureText(str).width / k; // en unités du dessin

  // Les mêmes pastilles qu'à l'écran : revenus et budget dans leur flux, le reste contre son nœud.
  const budgetNode = layout.nodes.find((n) => n.id === '__budget');
  const pills = [
    ...layout.nodes.filter((n) => n.column === 0).map((n) => ({ n, s: `${n.label} : ${money(n.value)}`, left: n.x + NODE_WIDTH + LINK_GAP + 6 })),
    { n: budgetNode, s: `${labels.budget} : ${money(budgetNode.value)}`, right: budgetNode.x - LINK_GAP - 6 },
    ...layout.nodes.filter((n) => n.column >= 2).map((n) => ({
      n,
      s: `${n.id === '__available' ? labels.available : n.label} : ${money(n.value)}`,
      right: n.x - LINK_GAP - 4,
    })),
  ].map((p) => {
    const w = widthOf(pillFont, p.s) + 14;
    return { ...p, w, x: MARGIN + (p.left ?? p.right - w), y: HEADER + p.n.y + p.n.h / 2 - PILL / 2 };
  });

  const element = (
    <Group>
      <Rect x={0} y={0} width={W * k} height={H * k} color={bg} />
      <Group transform={[{ scale: k }, { translateX: MARGIN }, { translateY: HEADER }]}>
        {layout.links.map((l) => (
          <Path key={l.id} path={bandPath(l)} color={l.color} />
        ))}
        {layout.nodes.map((n) => {
          const b = nodeBox(n);
          return <RoundedRect key={n.id} x={b.x} y={b.y} width={b.width} height={b.height} r={b.r} color={n.color} />;
        })}
        {pills.map((p) => (
          <RoundedRect key={`pill-${p.n.id}`} x={p.x - MARGIN} y={p.y - HEADER} width={p.w} height={PILL} r={5} color={PILL_COLORS.background} />
        ))}
      </Group>
      <Text x={MARGIN * k} y={36 * k} text={title} font={titleFont} color={text} />
      <Text x={MARGIN * k} y={58 * k} text={subtitle} font={subFont} color={sub} />
      {pills.map((p) => (
        <Text key={`txt-${p.n.id}`} x={(p.x + 7) * k} y={(p.y + 12.5) * k} text={p.s} font={pillFont} color={PILL_COLORS.text} />
      ))}
      <Text x={(W - MARGIN) * k - subFont.measureText(footer).width} y={(H - 12) * k} text={footer} font={subFont} color={sub} />
    </Group>
  );

  const image = await drawAsImage(element, { width: W * k, height: H * k });
  if (!image) throw new Error('RENDER');
  const uri = `${FileSystemLegacy.cacheDirectory}patrimo-budget.png`;
  await FileSystemLegacy.writeAsStringAsync(uri, image.encodeToBase64(), { encoding: 'base64' });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title });
  return true;
};
