export const TRADING_DEFINITIONS = {
  // Bot Configuration
  "tradeAmount": "The amount of money (USD) invested in each individual trade.",
  "expirySeconds": "Duration of each trade. Shorter times (e.g. 60s) are faster but more volatile.",
  "maxConcurrentTrades": "Max number of simultaneous open trades. Protects against over-exposure.",
  "stopLossAmount": "Safety Stop. Bot pauses if Total Net Loss hits this amount.",
  "takeProfitAmount": "Goal Limit. Bot pauses if Total Net Profit hits this amount.",
  "insuranceEnabled": "Loss Protection. If enabled, losing trades are refunded (100% Stake back).",
  "assets": "The assets (Crypto, Forex, Stocks) the bot monitors for trade signals.",
  "mode": "LIVE trades real money. DEMO trades virtual money.",

  // Strategy Descriptions
  "RSI_STRATEGY": "Relative Strength Index. Best for ranging markets. Buys when price is too low (Oversold) and sells when too high (Overbought).",
  "MACD_STRATEGY": "MACD Crossover. Best for trending markets. Buys when momentum shifts positive.",
  "SMA_CROSSOVER": "Golden Cross. Best for catching big trends. Buys when short-term average crosses above long-term average.",
  "RANDOM_TEST": "Random trading for testing system functionality.",

  // Strategy Parameters (Tooltips)
  "period": "Sensitivity. Lower values (e.g. 7) are faster but have more false signals. Higher values (e.g. 21) are smoother.",
  "fastPeriod": "Short-term trend lookback. Usually 10-12.",
  "slowPeriod": "Long-term trend lookback. Usually 26-50.",
  "signalPeriod": "Smoothing line for the indicator. Usually 9.",
};