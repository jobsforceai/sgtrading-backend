import { Schema, model, Document } from 'mongoose';

export interface IInvestmentVault extends Document {
  creatorId: Schema.Types.ObjectId;
  botId: Schema.Types.ObjectId; // The bot strategy used for this vault
  name: string;
  
  // Crowdfunding Config
  targetAmountUsd: number; // e.g. 35,000
  minInvestmentUsd: number;
  durationDays: number; // e.g. 30
  
  // Creator Config
  creatorCollateralPercent: number; // e.g. 50 (creator locks 50% of target)
  profitSharePercent: number; // e.g. 50 (creator takes 50% of user profits)
  
  // State
  status: 'FUNDING' | 'LOCKED' | 'ACTIVE' | 'SETTLED' | 'CANCELLED' | 'FAILED';
  totalPoolAmount: number; // Total funds currently in the pool (Users + Creator)
  userPoolAmount: number; // Funds from users only
  creatorLockedAmount: number; // Funds locked by creator
  
  startedAt?: Date;
  endsAt?: Date;
  settledAt?: Date;
}

const investmentVaultSchema = new Schema<IInvestmentVault>({
  creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: Schema.Types.ObjectId, ref: 'Bot', required: true },
  name: { type: String, required: true },
  
  targetAmountUsd: { type: Number, required: true },
  minInvestmentUsd: { type: Number, default: 100 },
  durationDays: { type: Number, required: true },
  
  creatorCollateralPercent: { type: Number, default: 50 },
  profitSharePercent: { type: Number, default: 50 },
  
  status: { type: String, enum: ['FUNDING', 'LOCKED', 'ACTIVE', 'SETTLED', 'CANCELLED', 'FAILED'], default: 'FUNDING' },
  
  totalPoolAmount: { type: Number, default: 0 },
  userPoolAmount: { type: Number, default: 0 },
  creatorLockedAmount: { type: Number, default: 0 },
  
  startedAt: { type: Date },
  endsAt: { type: Date },
  settledAt: { type: Date },
}, {
  timestamps: true,
});

const InvestmentVault = model<IInvestmentVault>('InvestmentVault', investmentVaultSchema);

export default InvestmentVault;
