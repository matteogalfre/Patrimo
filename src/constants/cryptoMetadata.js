/**
 * Métadonnées des cryptos supportées
 * Centralisé pour éviter la duplication entre les fichiers
 */

export const CRYPTO_METADATA = {
  BTC: { name: 'Bitcoin', color: '#F7931A', decimals: 5 },
  ETH: { name: 'Ethereum', color: '#627EEA', decimals: 4 },
  TAO: { name: 'Bittensor', color: '#FF6B6B', decimals: 4 },
  SOL: { name: 'Solana', color: '#00FFA3', decimals: 4 },
  THETA: { name: 'Theta Network', color: '#2AB8E6', decimals: 2 },
  RSR: { name: 'Reserve Rights', color: '#9D4EDD', decimals: 0 },
  ADA: { name: 'Cardano', color: '#0033AD', decimals: 2 },
  DOT: { name: 'Polkadot', color: '#E6007A', decimals: 3 },
  LINK: { name: 'Chainlink', color: '#2A5ADA', decimals: 3 },
  AVAX: { name: 'Avalanche', color: '#E84142', decimals: 3 },
  MATIC: { name: 'Polygon', color: '#8247E5', decimals: 2 },
  ATOM: { name: 'Cosmos', color: '#2E3148', decimals: 3 },
  DOGE: { name: 'Dogecoin', color: '#C3A634', decimals: 0 },
  XRP: { name: 'Ripple', color: '#23292F', decimals: 2 },
  LTC: { name: 'Litecoin', color: '#345D9D', decimals: 4 },
  UNI: { name: 'Uniswap', color: '#FF007A', decimals: 3 },
  AAVE: { name: 'Aave', color: '#B6509E', decimals: 3 },
};

/**
 * Liste des cryptos prédéfinies pour l'écran d'ajout
 */
export const PREDEFINED_CRYPTOS = [
  { symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' },
  { symbol: 'ETH', name: 'Ethereum', color: '#627EEA' },
  { symbol: 'SOL', name: 'Solana', color: '#00FFA3' },
  { symbol: 'TAO', name: 'Bittensor', color: '#FF6B6B' },
  { symbol: 'THETA', name: 'Theta', color: '#2AB8E6' },
  { symbol: 'RSR', name: 'Reserve', color: '#9D4EDD' },
  { symbol: 'ADA', name: 'Cardano', color: '#0033AD' },
  { symbol: 'DOT', name: 'Polkadot', color: '#E6007A' },
  { symbol: 'LINK', name: 'Chainlink', color: '#2A5ADA' },
  { symbol: 'AVAX', name: 'Avalanche', color: '#E84142' },
  { symbol: 'MATIC', name: 'Polygon', color: '#8247E5' },
];

/**
 * Génère une couleur à partir du symbole crypto
 * @param {string} symbol - Le symbole de la crypto
 * @returns {string} - Couleur HSL
 */
export const generateCryptoColor = (symbol) => {
  if (CRYPTO_METADATA[symbol]) {
    return CRYPTO_METADATA[symbol].color;
  }
  
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 50%)`;
};

/**
 * Récupère les métadonnées d'une crypto
 * @param {string} symbol - Le symbole de la crypto
 * @returns {object} - Métadonnées avec valeurs par défaut
 */
export const getCryptoMetadata = (symbol) => {
  const metadata = CRYPTO_METADATA[symbol];
  if (metadata) {
    return metadata;
  }
  
  return {
    name: symbol,
    color: generateCryptoColor(symbol),
    decimals: 2,
  };
};

/**
 * Obtient la précision décimale pour l'affichage d'une crypto
 * @param {string} symbol - Le symbole de la crypto
 * @returns {number} - Nombre de décimales
 */
export const getCryptoDecimals = (symbol) => {
  return CRYPTO_METADATA[symbol]?.decimals ?? 2;
};

export default CRYPTO_METADATA;
