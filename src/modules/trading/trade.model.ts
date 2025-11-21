import { Schema, model, Document } from 'mongoose';

export interface ITrade extends Document {
  userId: Schema.Types.ObjectId;
  walletId: Schema.Types.ObjectId;
  mode: 'LIVE' | 'DEMO';
  instrumentId: Schema.Types.ObjectId;
  instrumentSymbol: string;
  direction: 'UP' | 'DOWN';
  stakeUsd: number;
  payoutPercent: number;
  entryPrice: number;
  exitPrice: number | null;
  status: 'OPEN' | 'SETTLED';
  outcome: 'WIN' | 'LOSS' | 'DRAW' | null;
  payoutAmount: number | null; // The total amount credited to wallet (Stake + Profit)
  botId?: Schema.Types.ObjectId; // Reference to the bot if automated
  isInsured: boolean;
  insuranceCost: number;
  platformFee: number; // Profit share taken by platform
  requestedExpirySeconds: number;
  openAt: Date;
  expiresAt: Date;
  settledAt: Date | null;
}

const tradeSchema = new Schema<ITrade>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
  mode: { type: String, enum: ['LIVE', 'DEMO'], required: true },
  instrumentId: { type: Schema.Types.ObjectId, ref: 'Instrument', required: true },
  instrumentSymbol: { type: String, required: true },
  direction: { type: String, enum: ['UP', 'DOWN'], required: true },
  stakeUsd: { type: Number, required: true },
  payoutPercent: { type: Number, required: true },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number, default: null },
  status: { type: String, enum: ['OPEN', 'SETTLED'], default: 'OPEN' },
  outcome: { type: String, enum: ['WIN', 'LOSS', 'DRAW'], default: null },
  payoutAmount: { type: Number, default: null },
  botId: { type: Schema.Types.ObjectId, ref: 'Bot' },
  isInsured: { type: Boolean, default: false },
  insuranceCost: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  requestedExpirySeconds: { type: Number, required: true },
  openAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  settledAt: { type: Date, default: null },
}, {
  timestamps: true,
});

const Trade = model<ITrade>('Trade', tradeSchema);

export default Trade;
