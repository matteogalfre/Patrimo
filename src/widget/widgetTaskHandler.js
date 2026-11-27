import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';
import { transactionsRepo, dividendsRepo, cashRepo } from '../services/storage';
import { marketData } from '../services/marketData';
import { fxService } from '../services/fxService';
import { computePortfolio } from '../core/engine';
import { createFxConverter } from '../core/fx';
import { computeCash } from '../core/cash';
import { formatTime } from '../utils/formatters';
import { t, setLanguage, getDeviceLanguage, getLocaleTag } from '../i18n';
import { loadPinHashSecure } from '../utils/pinSecurity';

/** Un PIN protège l'app : le widget, visible de tous, masque alors les montants. */
const hasPin = async () => {
  try {
    return !!(await loadPinHashSecure());
  } catch {
    return false;
  }
};

const readSettings = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const readCache = async () => {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.WIDGET_DATA);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

/**
 * Calcule les chiffres du widget avec le même moteur que l'application : le
 * widget et le tableau de bord doivent afficher exactement la même chose.
 */
async function fetchPortfolioData() {
  const settings = await readSettings();
  const language = settings.language || getDeviceLanguage();
  setLanguage(language);
  const base = settings.currency || 'EUR';
  const locale = getLocaleTag(language);

  try {
    const [{ data: transactions }, { data: dividends }, { data: cashAccounts }] = await Promise.all([
      transactionsRepo.getAll(),
      dividendsRepo.getAll(),
      cashRepo.getAll(),
    ]);
    if (!transactions.length && !cashAccounts.length) return (await readCache()) || null;

    const assets = [...new Map(transactions.map((tx) => [tx.assetId, tx])).values()];
    const quotes = assets.length ? await marketData.getQuotes(assets) : {};
    const dates = [...transactions, ...dividends].map((x) => x.date);
    const first = dates.length ? dates.reduce((min, d) => (d < min ? d : min)) : new Date().toISOString();
    const currencies = [
      ...transactions.map((tx) => tx.currency),
      ...dividends.map((d) => d.currency),
      ...cashAccounts.map((a) => a.currency),
      ...Object.values(quotes).map((q) => q.currency),
    ];
    const rates = await fxService.loadRates(base, currencies, first);
    const fx = createFxConverter({ base, ...rates });
    const { totals, warnings } = computePortfolio({ transactions, dividends, quotes, fx });
    // Un cours ou un taux manque (hors ligne, source muette) : le calcul
    // compterait ces lignes au prix de revient ou à 0. Les derniers chiffres
    // justes valent mieux.
    // Seulement si le manque est nouveau : une ligne qu'aucune source ne cote
    // ne doit pas figer le widget pour toujours.
    const missing = [...warnings.missingQuotes, ...warnings.missingFx];
    const cached = await readCache();
    const knownMissing = new Set(cached?.missing || []);
    if (cached && missing.some((x) => !knownMissing.has(x))) return cached;
    const cash = computeCash({ accounts: cashAccounts, fx });
    const totalValue = totals.value + cash.total;
    const previous = totalValue - totals.dailyChange;

    const now = new Date();
    const widgetData = {
      totalValue,
      dailyChange: totals.dailyChange,
      dailyChangePercent: previous > 0 ? (totals.dailyChange / previous) * 100 : 0,
      totalPnL: totals.totalPnL,
      roi: totals.roi,
      currency: base,
      locale,
      privacy: !!settings.privacyMode || (await hasPin()),
      lastUpdated: formatTime(now),
      missing,
      timestamp: now.toISOString(),
    };
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.WIDGET_DATA, JSON.stringify(widgetData)],
      [STORAGE_KEYS.WIDGET_LAST_UPDATE, now.toISOString()],
    ]);
    return widgetData;
  } catch (error) {
    if (__DEV__) console.error('[Widget] Error fetching data:', error);
    return (await readCache()) || null;
  }
}

/**
 * Handler pour les tâches du widget Android
 */
export async function widgetTaskHandler(props) {
  const widgetInfo = props.widgetInfo;
  const Widget = props.renderWidget;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = (await fetchPortfolioData()) || {};
      const common = {
        totalValue: data.totalValue || 0,
        dailyChangePercent: data.dailyChangePercent || 0,
        currency: data.currency || 'EUR',
        locale: data.locale || 'fr-FR',
        // L'écran d'accueil est visible de tous : le mode discret et le PIN s'y appliquent aussi.
        hideAmounts: !!data.privacy || (await hasPin()),
      };

      if (widgetInfo.widgetName === 'PortfolioWidget') {
        Widget(
          <props.PortfolioWidget
            {...common}
            dailyChange={data.dailyChange || 0}
            totalPnL={data.totalPnL || 0}
            roi={data.roi || 0}
            lastUpdated={data.lastUpdated || '--:--'}
            labels={{ title: 'Patrimo', today: t('widget.today'), total: t('widget.totalGain') }}
          />,
        );
      } else if (widgetInfo.widgetName === 'PortfolioWidgetSmall') {
        Widget(<props.PortfolioWidgetSmall {...common} />);
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Récupérer les données du widget depuis le cache
 */
export async function getWidgetData() {
  return readCache();
}

/**
 * Forcer une mise à jour du widget
 */
export async function updateWidget() {
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    await fetchPortfolioData();
    await requestWidgetUpdate({ widgetName: 'PortfolioWidget' });
    await requestWidgetUpdate({ widgetName: 'PortfolioWidgetSmall' });
    return true;
  } catch (error) {
    if (__DEV__) console.error('[Widget] Update error:', error);
    return false;
  }
}
