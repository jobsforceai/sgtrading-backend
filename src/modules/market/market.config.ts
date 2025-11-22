// src/modules/market/market.config.ts
export const BINANCE_SYMBOLS = [
  'btcusdt',
  'ethusdt',
  'solusdt', 'xrpusdt', 'adausdt', 'dogeusdt', 'dotusdt', 'maticusdt', 
  'ltcusdt', 'linkusdt', 'bchusdt', 'xlmusdt', 'uniusdt', 'avaxusdt', 
  'etcusdt', 'filusdt', 'aaveusdt', 'algousdt', 'egldusdt', 'sandusdt', 
  'axsusdt', 'manausdt', 'thetausdt', 'vetusdt', 'icpusdt', 'trxusdt', 
  'eosusdt', 'xtzusdt', 'mkrusdt', 'neousdt'
];

export const STOCK_SYMBOLS = [
  'aapl', 'tsla', 'gld', 
  'nvda', 'amd', 'msft', 'googl', 'amzn', 
  'meta', 'nflx', 'spy', 'qqq', 'v', 'jpm'
]; // Stock/ETF symbols

export const SYNTHETIC_SYMBOLS = ['sgc']; // Our internal tokens

export const BINANCE_WS_URL = 'wss://stream.binance.com:9443/stream';