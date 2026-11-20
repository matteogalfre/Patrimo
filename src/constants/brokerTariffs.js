/**
 * Grilles de courtage des courtiers, relevées sur leurs pages de tarifs
 * (brochures officielles quand elles se lisent, presse spécialisée sinon).
 *
 * Chaque grille dit pour quelles enveloppes elle vaut (`accounts`), à quelle
 * date elle s'applique (`asOf`) et où la vérifier (`source`). Les barèmes
 * sont rangés par devise d'ordre (`EUR` pour Euronext, `*` pour toutes) :
 *  - `markets` : le barème courant ;
 *  - `funds` : celui des ETF et fonds quand il diffère ;
 *  - `symbols` : celui de certains titres (BTC chez Bitpanda) ;
 *  - `plan` : celui des achats programmés.
 * Un barème se lit avec `scheduleFee` (core/brokerFees). Le pourcentage
 * au-delà des paliers porte sur tout le montant de l'ordre.
 *
 * Pas modélisé (l'estimation est alors un peu haute) : ETF partenaires
 * gratuits (BoursoBank, Saxo, Scalable), premier ordre du mois offert
 * (Fortuneo Starter), promotions. Les courtiers changent leurs prix :
 * l'estimation pré-remplit le champ, l'avis d'opéré fait foi.
 */

const STABLE_AND_BTC = { '*': { pct: 0.99 } };

export const BROKER_TARIFFS = Object.freeze([
  {
    id: 'boursedirect',
    institution: 'boursedirect',
    name: 'Bourse Direct',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-01-06',
    source: 'https://www.boursedirect.fr/fr/tarifs',
    markets: {
      EUR: {
        tiers: [
          { upTo: 500, fee: 0.99 },
          { upTo: 1000, fee: 1.9 },
          { upTo: 2000, fee: 2.9 },
          { upTo: 4400, fee: 3.8 },
        ],
        pct: 0.09,
      },
    },
  },
  // Depuis la fin des paiements pour flux d'ordres (2 juillet 2026) : deux modes.
  {
    id: 'traderepublic',
    institution: 'traderepublic',
    name: 'Trade Republic',
    offer: 'Best Price',
    accounts: ['PEA', 'CTO', 'CRYPTO'],
    asOf: '2026-07-02',
    source: 'https://traderepublic.com/fr-fr/pricing',
    markets: { '*': { fee: 1 } },
    plan: { fee: 0 },
  },
  {
    id: 'traderepublic-direct',
    institution: 'traderepublic',
    name: 'Trade Republic',
    offer: 'Direct Price',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-07-02',
    source: 'https://traderepublic.com/fr-fr/pricing',
    markets: { '*': { fee: 2 } },
    plan: { fee: 0 },
  },
  {
    id: 'bourso-decouverte',
    institution: 'bourso',
    name: 'BoursoBank',
    offer: 'Découverte',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-10-05',
    source: 'https://s.brsimg.com/content/brochure_tarifaire/boursorama_bt.pdf',
    markets: { EUR: { tiers: [{ upTo: 500, fee: 1.99 }], pct: 0.6 } },
  },
  {
    id: 'bourso-classic',
    institution: 'bourso',
    name: 'BoursoBank',
    offer: 'Classic',
    accounts: ['CTO'],
    asOf: '2026-10-05',
    source: 'https://s.brsimg.com/content/brochure_tarifaire/boursorama_bt.pdf',
    markets: { EUR: { tiers: [{ upTo: 1000, fee: 5.5 }], pct: 0.48, min: 8.95 } },
  },
  {
    id: 'bourso-trader',
    institution: 'bourso',
    name: 'BoursoBank',
    offer: 'Trader',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-10-05',
    source: 'https://s.brsimg.com/content/brochure_tarifaire/boursorama_bt.pdf',
    markets: { EUR: { tiers: [{ upTo: 7750, fee: 16.65 }], pct: 0.22 } },
  },
  {
    id: 'fortuneo-starter',
    institution: 'fortuneo',
    name: 'Fortuneo',
    offer: 'Starter',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-08-06',
    source: 'https://www.fortuneo.fr/files/tarifs_fortuneo.pdf',
    markets: { EUR: { pct: 0.35 } },
  },
  {
    id: 'fortuneo-progress',
    institution: 'fortuneo',
    name: 'Fortuneo',
    offer: 'Progress',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-08-06',
    source: 'https://www.fortuneo.fr/files/tarifs_fortuneo.pdf',
    markets: { EUR: { tiers: [{ upTo: 3000, fee: 4.9 }], pct: 0.15 } },
  },
  {
    id: 'fortuneo-traderpro',
    institution: 'fortuneo',
    name: 'Fortuneo',
    offer: 'Trader Pro',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-08-06',
    source: 'https://www.fortuneo.fr/files/tarifs_fortuneo.pdf',
    markets: { EUR: { tiers: [{ upTo: 10000, fee: 9.5 }], pct: 0.1 } },
  },
  // 1 € de commission plus 1 € de frais de traitement ; pas de PEA.
  {
    id: 'degiro',
    institution: 'degiro',
    name: 'DEGIRO',
    accounts: ['CTO'],
    asOf: '2026-11-04',
    source: 'https://www.degiro.fr/tarifs',
    markets: { EUR: { fee: 2 } },
    funds: { EUR: { fee: 3 } },
  },
  {
    id: 'saxo',
    institution: 'saxo',
    name: 'Saxo',
    offer: 'Classic',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-05-05',
    source: 'https://www.home.saxo/fr-fr/rates-and-conditions/stocks/commissions',
    markets: { EUR: { pct: 0.08, min: 2 } },
  },
  // Formule fixe : frais de bourse et de compensation compris.
  {
    id: 'ibkr',
    institution: 'ibkr',
    name: 'Interactive Brokers',
    offer: 'Fixed',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-01-15',
    source: 'https://www.interactivebrokers.ie/fr/pricing/commissions-stocks-europe.php',
    markets: { EUR: { pct: 0.05, min: 3 } },
  },
  // Sur European Investor Exchange ; pas de PEA ni d'Euronext Paris.
  {
    id: 'scalable-free',
    institution: 'scalable',
    name: 'Scalable Capital',
    offer: 'FREE',
    accounts: ['CTO'],
    asOf: '2026-11-04',
    source: 'https://fr.scalable.capital/frais-courtage',
    markets: { EUR: { fee: 0.99 } },
    plan: { fee: 0 },
  },
  {
    id: 'scalable-prime',
    institution: 'scalable',
    name: 'Scalable Capital',
    offer: 'PRIME+',
    accounts: ['CTO'],
    asOf: '2026-11-04',
    source: 'https://fr.scalable.capital/frais-courtage',
    markets: { EUR: { tiers: [{ upTo: 249.99, fee: 0.99 }] } },
    plan: { fee: 0 },
  },
  // Gratuit tant que le volume du mois reste sous 100 000 €.
  {
    id: 'xtb',
    institution: 'xtb',
    name: 'XTB',
    accounts: ['PEA', 'CTO'],
    asOf: '2026-11-04',
    source: 'https://www.xtb.com/fr/pea',
    markets: { EUR: { fee: 0 } },
  },
  // 1 € par ordre une fois les ordres offerts du mois épuisés (aucun en
  // Standard et Plus depuis le 28 juillet 2026, 5 en Premium, 10 en Metal et
  // Ultra : non comptés ici). Plans d'investissement en ETF sans commission.
  {
    id: 'revolut',
    institution: 'revolut',
    name: 'Revolut',
    accounts: ['CTO'],
    asOf: '2026-10-20',
    source: 'https://cdn.revolut.com/legal/terms/RSEUAB/ex-ante-costs-report-EEA-stocks-v5.0-EN.pdf',
    markets: { '*': { fee: 1 } },
    plan: { fee: 0 },
  },
  // Crypto : le plus élevé d'un minimum par tranche et d'un pourcentage.
  {
    id: 'revolut-crypto',
    institution: 'revolut',
    name: 'Revolut',
    offer: 'Standard, Plus',
    accounts: ['CRYPTO'],
    asOf: '2026-08-11',
    source: 'https://cdn.revolut.com/terms_and_conditions/pdf/personal_fees_exchanging_cryptocurrencies_e8264c8b_1.0.6_1786437601_en.pdf',
    markets: {
      '*': {
        tiers: [{ upTo: 5, fee: 0.99 }, { upTo: 25, fee: 1.49 }, { upTo: 100, fee: 1.99 }, { upTo: 150, fee: 2.49 }, { upTo: 200, fee: 2.99 }],
        pct: 1.49,
      },
    },
  },
  {
    id: 'revolut-crypto-premium',
    institution: 'revolut',
    name: 'Revolut',
    offer: 'Premium, Metal',
    accounts: ['CRYPTO'],
    asOf: '2026-08-11',
    source: 'https://cdn.revolut.com/terms_and_conditions/pdf/personal_fees_exchanging_cryptocurrencies_e8264c8b_1.0.6_1786437601_en.pdf',
    markets: { '*': { tiers: [{ upTo: 50, fee: 0.99 }, { upTo: 150, fee: 1.49 }, { upTo: 200, fee: 1.99 }], pct: 0.99 } },
  },
  // Bitcoin seulement. Le taux baisse avec le volume des 30 derniers jours
  // (1,25 % dès 250 €, 1 % dès 1 000 €) ; +0,70 % payé par carte.
  {
    id: 'bitstack',
    institution: 'bitstack',
    name: 'Bitstack',
    accounts: ['CRYPTO'],
    asOf: '2026-09-15',
    source: 'https://www.bitstack-app.com/fr-FR/pricing',
    markets: { '*': { pct: 1.5 } },
  },
  {
    id: 'bitstack-plus',
    institution: 'bitstack',
    name: 'Bitstack',
    offer: 'Plus',
    accounts: ['CRYPTO'],
    asOf: '2026-09-15',
    source: 'https://www.bitstack-app.com/fr-FR/pricing',
    markets: { '*': { pct: 0.75 } },
  },
  // Page de tarifs officielle illisible hors de l'app : chiffres de la presse.
  {
    id: 'deblock',
    institution: 'deblock',
    name: 'Deblock',
    accounts: ['CRYPTO'],
    asOf: '2026-07-05',
    source: 'https://www.moneyvox.fr/epargne/deblock',
    markets: { '*': { pct: 1.99 } },
  },
  {
    id: 'deblock-premium',
    institution: 'deblock',
    name: 'Deblock',
    offer: 'Premium',
    accounts: ['CRYPTO'],
    asOf: '2026-07-05',
    source: 'https://www.moneyvox.fr/epargne/deblock',
    markets: { '*': { pct: 0.49 } },
  },
  // Ordre au marché (taker), premier palier, depuis le 16 septembre 2026.
  // L'achat simple de l'app coûte plus (frais non publiés de façon lisible).
  {
    id: 'coinbase-advanced',
    institution: 'coinbase',
    name: 'Coinbase',
    offer: 'Advanced',
    accounts: ['CRYPTO'],
    asOf: '2026-09-16',
    source: 'https://www.coinbase.com/blog/were-lowering-fees-for-many-active-traders-on-coinbase-advanced',
    markets: { '*': { pct: 0.5 } },
  },
  {
    id: 'binance',
    institution: 'binance',
    name: 'Binance',
    accounts: ['CRYPTO'],
    asOf: '2026-11-04',
    source: 'https://www.binance.com/fr/fee/trading',
    markets: { '*': { pct: 0.1 } },
  },
  {
    id: 'kraken',
    institution: 'kraken',
    name: 'Kraken',
    offer: 'Achat instantané',
    accounts: ['CRYPTO'],
    asOf: '2026-11-04',
    source: 'https://www.kraken.com/features/fee-schedule',
    markets: { '*': { pct: 1 } },
  },
  // Ordre au marché (taker), premier palier de volume.
  {
    id: 'kraken-pro',
    institution: 'kraken',
    name: 'Kraken',
    offer: 'Pro',
    accounts: ['CRYPTO'],
    asOf: '2026-11-04',
    source: 'https://www.kraken.com/features/fee-schedule',
    markets: { '*': { pct: 0.8 } },
  },
  {
    id: 'bitpanda',
    institution: 'bitpanda',
    name: 'Bitpanda',
    accounts: ['CRYPTO'],
    asOf: '2026-07-08',
    source: 'https://www.bitpanda.com/fr/prix',
    markets: { '*': { pct: 1.49 } },
    symbols: { BTC: STABLE_AND_BTC, USDC: STABLE_AND_BTC, USDT: STABLE_AND_BTC },
  },
]);

/** « BoursoBank Découverte », « Bourse Direct ». */
export const tariffLabel = (tariff) => (tariff.offer ? `${tariff.name} ${tariff.offer}` : tariff.name);
