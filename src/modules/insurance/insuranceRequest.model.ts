import { Schema, model, Document } from 'mongoose';

export interface IInsuranceRequest extends Document {
  userId: Schema.Types.ObjectId;
  botId: Schema.Types.ObjectId;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  premiumAmount: number; // Cost to buy insurance
  coverageAmount: number; // Max amount covered
  lockedFunds: number; // Collateral locked by creator
  terms: string;
  adminComments?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
}

const insuranceRequestSchema = new Schema<IInsuranceRequest>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: Schema.Types.ObjectId, ref: 'Bot', required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING' },
  premiumAmount: { type: Number, required: true },
  coverageAmount: { type: Number, required: true },
  lockedFunds: { type: Number, default: 0 },
  terms: { type: String, default: '' },
  adminComments: { type: String },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
}, {
  timestamps: true,
});

const InsuranceRequest = model<IInsuranceRequest>('InsuranceRequest', insuranceRequestSchema);

export default InsuranceRequest;
