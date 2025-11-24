import { Schema, model, Document } from 'mongoose';

export interface IVaultParticipation extends Document {
  userId: Schema.Types.ObjectId;
  vaultId: Schema.Types.ObjectId;
  
  amountLockedUsd: number; // The user's investment
  
  // Insurance
  isInsured: boolean;
  insuranceFeePaidUsd: number; // The 10% fee paid
  insuranceCoverageUsd: number; // The coverage limit (e.g. 50% of locked)
  
  // Outcome
  finalPayoutUsd?: number; // How much they got back
  netPnL?: number;
  
  status: 'ACTIVE' | 'SETTLED' | 'REFUNDED';
}

const vaultParticipationSchema = new Schema<IVaultParticipation>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  vaultId: { type: Schema.Types.ObjectId, ref: 'InvestmentVault', required: true },
  
  amountLockedUsd: { type: Number, required: true },
  
  isInsured: { type: Boolean, default: false },
  insuranceFeePaidUsd: { type: Number, default: 0 },
  insuranceCoverageUsd: { type: Number, default: 0 },
  
  finalPayoutUsd: { type: Number },
  netPnL: { type: Number },
  
  status: { type: String, enum: ['ACTIVE', 'SETTLED', 'REFUNDED'], default: 'ACTIVE' },
}, {
  timestamps: true,
});

// One participation per user per vault? 
// Or allow multiple? Multiple allows topping up easily.
// Let's allow multiple for flexibility, or aggregate them in service.
// For simplicity in MVP, let's keep it one record and update it?
// Actually, separate records are cleaner for audit trails.
// But checking "Did I invest?" is easier with unique compound index.
// Let's enforce unique for now to keep logic simple.
vaultParticipationSchema.index({ userId: 1, vaultId: 1 }, { unique: true });

const VaultParticipation = model<IVaultParticipation>('VaultParticipation', vaultParticipationSchema);

export default VaultParticipation;
