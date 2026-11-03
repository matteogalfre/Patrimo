import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

const GREEN = '#3DBE7A';
const RED = '#F06A6A';
const MUTED = '#7D8087';
const LABEL = '#A6A8AD';
const BG = '#17181B';

/** Montant entier dans la devise de référence, abrégé au-delà du million. */
const formatMoney = (value, currency, locale, { compact = false } = {}) => {
  const num = Number(value) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: compact && Math.abs(num) >= 1e4 ? 1 : 0,
      notation: compact && Math.abs(num) >= 1e4 ? 'compact' : 'standard',
    }).format(num);
  } catch {
    return `${Math.round(num)} ${currency}`;
  }
};

const signed = (num, text) => `${num > 0 ? '+' : ''}${text}`;
const MASK = '••••••';
const pct = (num) => signed(num, `${(Number(num) || 0).toFixed(2)}%`);

/**
 * Widget Android : valeur du patrimoine, variation du jour et plus-value
 * totale (réalisée, latente et dividendes).
 */
export function PortfolioWidget({
  totalValue, dailyChange, dailyChangePercent, totalPnL, roi,
  currency = 'EUR', locale = 'fr-FR', lastUpdated, labels = {}, hideAmounts = false,
}) {
  const money = (v) => (hideAmounts ? MASK : formatMoney(v, currency, locale));
  const up = dailyChange >= 0;
  const gain = totalPnL >= 0;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: BG,
        borderRadius: 24,
      }}
      clickAction="OPEN_APP"
    >
      <FlexWidget
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: 'match_parent' }}
      >
        <TextWidget text={labels.title || 'Patrimo'} style={{ fontSize: 14, fontWeight: '600', color: LABEL }} />
        <TextWidget text={lastUpdated || '--:--'} style={{ fontSize: 10, color: MUTED }} />
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-start', marginTop: 8 }}>
        <TextWidget
          text={money(totalValue)}
          style={{ fontSize: 30, fontWeight: 'bold', color: '#FFFFFF' }}
        />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <TextWidget text={up ? '▲' : '▼'} style={{ fontSize: 12, color: up ? GREEN : RED, marginRight: 4 }} />
          <TextWidget
            text={hideAmounts ? pct(dailyChangePercent) : `${signed(dailyChange, money(dailyChange))} (${pct(dailyChangePercent)})`}
            style={{ fontSize: 14, fontWeight: '500', color: up ? GREEN : RED }}
          />
          <TextWidget text={` ${labels.today || '24h'}`} style={{ fontSize: 12, color: MUTED, marginLeft: 4 }} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', height: 1, backgroundColor: '#26272C', marginVertical: 12 }} />

      <FlexWidget
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: 'match_parent' }}
      >
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={labels.total || 'Plus-value totale'} style={{ fontSize: 12, color: LABEL }} />
          <TextWidget
            text={hideAmounts ? MASK : signed(totalPnL, money(totalPnL))}
            style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}
          />
        </FlexWidget>
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: gain ? 'rgba(61, 190, 122, 0.14)' : 'rgba(240, 106, 106, 0.14)',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 12,
          }}
        >
          <TextWidget text={pct(roi)} style={{ fontSize: 13, fontWeight: '600', color: gain ? GREEN : RED }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

/** Version compacte (2x2). */
export function PortfolioWidgetSmall({ totalValue, dailyChangePercent, currency = 'EUR', locale = 'fr-FR', hideAmounts = false }) {
  const up = dailyChangePercent >= 0;
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        backgroundColor: BG,
        borderRadius: 20,
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget text="Patrimo" style={{ fontSize: 12, fontWeight: '600', color: LABEL, marginBottom: 4 }} />
      <TextWidget
        text={hideAmounts ? MASK : formatMoney(totalValue, currency, locale, { compact: true })}
        style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' }}
      />
      <TextWidget
        text={pct(dailyChangePercent)}
        style={{ fontSize: 12, fontWeight: '500', color: up ? GREEN : RED, marginTop: 4 }}
      />
    </FlexWidget>
  );
}
