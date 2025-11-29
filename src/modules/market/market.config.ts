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

export const OANDA_SYMBOLS = [
  'eur_usd', 'gbp_usd', 'usd_jpy', 'usd_cad', 'aud_usd', 'usd_chf', 'nzd_usd', 'eur_gbp', 'eur_jpy', 'gbp_jpy', 'aud_jpy', 
  'xau_usd', 'xag_usd', 'xpt_usd', 'xpd_usd', 'wtico_usd', 'bco_usd', 'natgas_usd'
];

export const BINANCE_WS_URL = 'wss://stream.binance.com:9443/stream';