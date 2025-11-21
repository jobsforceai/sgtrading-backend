import { Schema, model, Document } from 'mongoose';

export interface IInstrument extends Document {
  symbol: string;
  displayName: string;
  type: 'CRYPTO' | 'FOREX' | 'INDEX' | 'STOCK';
  isEnabled: boolean;
  decimalPlaces: number;
  minStakeUsd: number;
  maxStakeUsd: number;
  defaultPayoutPercent: number;
  description?: string;
  baseCurrency?: string;
  quoteCurrency?: string;
  tradingHours?: {
    timezone: string;
    sessions: Array<{ dayOfWeek: number; open: string; close: string }>;
  };
}

const instrumentSchema = new Schema<IInstrument>({
  symbol: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  type: { type: String, enum: ['CRYPTO', 'FOREX', 'INDEX', 'STOCK'], required: true },
  isEnabled: { type: Boolean, default: true },
  decimalPlaces: { type: Number, required: true },
  minStakeUsd: { type: Number, required: true },
  maxStakeUsd: { type: Number, required: true },
  defaultPayoutPercent: { type: Number, required: true },
  description: { type: String },
  baseCurrency: { type: String },
  quoteCurrency: { type: String },
  tradingHours: {
    timezone: String,
    sessions: [{
      dayOfWeek: Number,
      open: String,
      close: String,
    }],
  },
}, {
  timestamps: true,
});

const Instrument = model<IInstrument>('Instrument', instrumentSchema);

export default Instrument;
