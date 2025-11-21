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
}

const candleSchema = new Schema<ICandle>({
  symbol: { type: String, required: true, index: true },
  resolution: { type: String, required: true },
  time: { type: Date, required: true, index: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, default: 0 },
}, {
  timestamps: true,
});

// Compound index for efficient querying
candleSchema.index({ symbol: 1, resolution: 1, time: 1 }, { unique: true });

const Candle = model<ICandle>('Candle', candleSchema);

export default Candle;
