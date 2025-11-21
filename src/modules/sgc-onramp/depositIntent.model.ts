import { Schema, model, Document } from 'mongoose';

export interface IDepositIntent extends Document {
  userId: Schema.Types.ObjectId;
  amountUsd: number;
  sgcAmount: number;
  exchangeRate: number;
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'FAILED';
  sgchainTxHash: string | null;
  payloadId: string;
  expiresAt: Date;
}

const depositIntentSchema = new Schema<IDepositIntent>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amountUsd: { type: Number, required: true },
  sgcAmount: { type: Number, required: true },
  exchangeRate: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'CONFIRMED', 'EXPIRED', 'FAILED'], default: 'PENDING' },
  sgchainTxHash: { type: String, default: null },
  payloadId: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
}, {
  timestamps: true,
});

const DepositIntent = model<IDepositIntent>('DepositIntent', depositIntentSchema);

export default DepositIntent;
