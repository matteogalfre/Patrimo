
describe('budgetPlanSuggestions', () => {
  const { budgetPlanSuggestions } = require('../plans');
  const budget = { groups: [
    { kind: 'expense', items: [{ id: 'x', label: 'Loyer', amount: 500 }] },
    { kind: 'invest', items: [{ id: 'a', label: 'ETF', amount: 500 }, { id: 'b', label: 'BTC', amount: 400 }, { id: 'c', label: 'Livret jeune', amount: 50 }] },
  ] };
  const assets = [
    { assetId: 'stock:ESE.PA', assetType: 'stock', symbol: 'ESE.PA', name: 'BNP Paribas Easy S&P 500 UCITS ETF', isHeld: true },
    { assetId: 'stock:TEP.PA', assetType: 'stock', symbol: 'TEP.PA', name: 'Teleperformance', isHeld: true },
    { assetId: 'crypto:BTC', assetType: 'crypto', symbol: 'BTC', name: 'Bitcoin', isHeld: true },
  ];
  const today = new Date('2026-11-05');
  const tx = [{ assetId: 'stock:ESE.PA', side: 'buy', quantity: 10, unitPrice: 30, date: '2026-10-01' }];

  it('reconnaît les lignes et propose l’actif', () => {
    const s = budgetPlanSuggestions({ budget, assets, transactions: tx, today });
    expect(s.map((x) => [x.label, x.asset?.assetId ?? null])).toEqual([['ETF', 'stock:ESE.PA'], ['BTC', 'crypto:BTC'], ['Livret jeune', null]]);
  });

  it('les lignes déjà programmées disparaissent', () => {
    const s = budgetPlanSuggestions({ budget, assets, transactions: tx, today, plans: [{ assetId: 'crypto:BTC', active: true }] });
    expect(s.map((x) => x.label)).toEqual(['ETF', 'Livret jeune']);
    expect(budgetPlanSuggestions({ budget: null, assets })).toEqual([]);
  });
});
