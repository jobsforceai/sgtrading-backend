import { Schema, model, Document } from 'mongoose';

export interface IBotConfig {
  tradeAmount: number;      // Stake per trade (e.g., $10)
  expirySeconds: number;    // Trade duration (e.g., 60)
  maxConcurrentTrades: number; // Max trades running at once
  stopLossAmount: number;   // Stop if Net Loss >= this (positive number)
  takeProfitAmount: number; // Stop if Net Profit >= this
  dailyTradeLimit?: number; // Optional max trades per day
}

export interface IBotStats {
  totalTrades: number;
  wins: number;
  losses: number;
  draws: number;
  netPnL: number;      // Realized PnL
  activeTrades: number; // Currently open
}

export interface IBot extends Document {
  userId: Schema.Types.ObjectId;
  name: string;
  mode: 'LIVE'; // Only LIVE allowed now
  visibility: 'PRIVATE' | 'PUBLIC';
  strategy: 'RSI_STRATEGY' | 'MACD_STRATEGY' | 'RANDOM_TEST' | 'SMA_CROSSOVER';
  assets: string[]; // Symbols to trade
  parameters: Record<string, any>; // Strategy params
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'ARCHIVED';
  
  config: IBotConfig;

  profitSharePercent: number; // % of profit shared with creator (if cloned) or platform
  
  // New Insurance System
  insuranceStatus: 'NONE' | 'PENDING' | 'ACTIVE' | 'REJECTED';
  
  // Public Bot Lineage
  clonedFrom?: Schema.Types.ObjectId; // If using a public bot

  stats: IBotStats;
}

const botSchema = new Schema<IBot>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  mode: { type: String, enum: ['LIVE'], default: 'LIVE' }, 
  visibility: { type: String, enum: ['PRIVATE', 'PUBLIC'], default: 'PRIVATE' },
  strategy: { type: String, enum: ['RSI_STRATEGY', 'MACD_STRATEGY', 'RANDOM_TEST', 'SMA_CROSSOVER'], required: true },
  assets: { type: [String], required: true, default: ['btcusdt'] },
  parameters: { type: Map, of: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['ACTIVE', 'PAUSED', 'STOPPED', 'ARCHIVED'], default: 'PAUSED' },
  
  config: {
    tradeAmount: { type: Number, required: true, default: 10 },
    expirySeconds: { type: Number, required: true, default: 60 },
    maxConcurrentTrades: { type: Number, default: 1 },
    stopLossAmount: { type: Number, default: 100 },
    takeProfitAmount: { type: Number, default: 200 },
    dailyTradeLimit: { type: Number },
  },

  profitSharePercent: { type: Number, default: 50 },
  
  insuranceStatus: { type: String, enum: ['NONE', 'PENDING', 'ACTIVE', 'REJECTED'], default: 'NONE' },
  clonedFrom: { type: Schema.Types.ObjectId, ref: 'Bot', index: true },
  
  stats: {
    totalTrades: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    netPnL: { type: Number, default: 0 },
    activeTrades: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

const Bot = model<IBot>('Bot', botSchema);

export default Bot;