/**
 * Export CSV du récapitulatif fiscal, à garder avec ses justificatifs ou à
 * comparer à l'IFU du courtier. Séparateur point-virgule et virgule décimale
 * pour qu'Excel et Numbers en français l'ouvrent correctement.
 */

import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '');
const day = (d) => new Date(d).toISOString().slice(0, 10);
const cell = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const buildTaxCsv = ({ year, currency, cto, crypto, labels }) => {
  const rows = [
    [labels.title, year, currency],
    [],
    [labels.ctoSection],
    [labels.date, labels.asset, labels.quantity, labels.proceeds, labels.cost, labels.gain],
    ...cto.sales.map((s) => [day(s.date), s.name || s.symbol, n2(s.quantity), n2(s.proceeds), n2(s.cost), n2(s.gain)]),
    [labels.total, '', '', n2(cto.proceeds), n2(cto.cost), n2(cto.net)],
    [labels.dividends, '', '', '', '', n2(cto.dividends)],
    [],
    [labels.cryptoSection],
    [labels.date, labels.asset, labels.quantity, labels.proceeds, labels.portfolioValue, labels.acquisitionShare, labels.gain],
    ...crypto.sales.map((s) => [day(s.date), s.symbol, n2(s.quantity), n2(s.proceeds), n2(s.portfolioValue), n2(s.acquisitionShare), n2(s.gain)]),
    [labels.total, '', '', n2(crypto.proceeds), '', '', n2(crypto.net)],
    [],
    [labels.disclaimer],
  ];
  return rows.map((r) => r.map(cell).join(';')).join('\n');
};

export const shareTaxCsv = async (csv, year) => {
  const path = `${FileSystemLegacy.cacheDirectory}patrimo_fiscalite_${year}.csv`;
  // BOM : sans lui, Excel lit les accents de travers.
  await FileSystemLegacy.writeAsStringAsync(path, `\ufeff${csv}`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('SHARING_UNAVAILABLE');
  await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
};
