import { Schema, model, Document } from 'mongoose';

export interface ILedgerEntry extends Document {
  walletId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE_OPEN_HOLD' | 'TRADE_PAYOUT' | 'TRADE_LOSS' | 'ADJUSTMENT' | 'PLATFORM_FEE' | 'INSURANCE_PAYOUT';
  mode: 'LIVE' | 'DEMO';
  amountUsd: number;
  referenceType: 'TRADE' | 'DEPOSIT_INTENT' | 'WITHDRAWAL_REQUEST' | 'ADMIN_ADJUSTMENT' | 'SGC_REDEMPTION';
  referenceId: Schema.Types.ObjectId | string;
}

const ledgerEntrySchema = new Schema<ILedgerEntry>({
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL', 'TRADE_OPEN_HOLD', 'TRADE_PAYOUT', 'TRADE_LOSS', 'ADJUSTMENT', 'PLATFORM_FEE', 'INSURANCE_PAYOUT'], required: true },
  mode: { type: String, enum: ['LIVE', 'DEMO'], required: true },
  amountUsd: { type: Number, required: true }, // Can be positive or negative
  referenceType: { type: String, enum: ['TRADE', 'DEPOSIT_INTENT', 'WITHDRAWAL_REQUEST', 'ADMIN_ADJUSTMENT', 'SGC_REDEMPTION'], required: true },
  referenceId: { type: Schema.Types.Mixed, required: true },
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Ledger entries are immutable
});

const LedgerEntry = model<ILedgerEntry>('LedgerEntry', ledgerEntrySchema);

export default LedgerEntry;
