// src/modules/market/market.config.ts
export const BINANCE_SYMBOLS = [
  'btcusdt',
  'ethusdt',
  // We can add more symbols here later
];

export const STOCK_SYMBOLS = ['aapl', 'tsla', 'gld']; // Stock/ETF symbols

export const SYNTHETIC_SYMBOLS = ['sgc']; // Our internal tokens

export const BINANCE_WS_URL = 'wss://stream.binance.com:9443/stream';