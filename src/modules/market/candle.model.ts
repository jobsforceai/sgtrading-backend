import { Schema, model, Document } from 'mongoose';

export interface ICandle extends Document {
  symbol: string;
  resolution: string; // '1m' for now
  time: Date;         // Start time of the candle
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isSynthetic: boolean;
}

const candleSchema = new Schema<ICandle>({
  symbol: { type: String, required: true, uppercase: true },
  resolution: { type: String, required: true }, // '1m', '5m', '1h', '1d'
  time: { type: Date, required: true }, // Start time of the candle
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, required: true },
  isSynthetic: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Compound index for efficient querying
candleSchema.index({ symbol: 1, resolution: 1, time: 1 }, { unique: true });

const Candle = model<ICandle>('Candle', candleSchema);

export default Candle;
