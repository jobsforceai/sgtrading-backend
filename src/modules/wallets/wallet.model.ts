import { Schema, model, Document } from 'mongoose';

export interface IWallet extends Document {
  userId: Schema.Types.ObjectId;
  liveBalanceUsd: number;
  bonusBalanceUsd: number;
  demoBalanceUsd: number;
  currency: 'USD';
}

const walletSchema = new Schema<IWallet>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  liveBalanceUsd: { type: Number, default: 0 },
  bonusBalanceUsd: { type: Number, default: 0 }, // Non-withdrawable portion of liveBalance
  demoBalanceUsd: { type: Number, default: 1000000 }, // 10,000 USD in cents
  currency: { type: String, enum: ['USD'], default: 'USD' },
}, {
  timestamps: true,
});

const Wallet = model<IWallet>('Wallet', walletSchema);

export default Wallet;
