import { Schema, model, Document } from 'mongoose';

export interface ISgcRedemptionCode extends Document {
  code: string;
  userId: Schema.Types.ObjectId;
  amountUsd: number;
  status: 'PENDING' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: Date;
  claimedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sgcRedemptionCodeSchema = new Schema<ISgcRedemptionCode>({
  code: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amountUsd: { type: Number, required: true },
  status: { 
      type: String, 
      enum: ['PENDING', 'CLAIMED', 'EXPIRED', 'CANCELLED'], 
      default: 'PENDING' 
  },
  expiresAt: { type: Date, required: true },
  claimedAt: { type: Date },
}, {
  timestamps: true,
});

const SgcRedemptionCode = model<ISgcRedemptionCode>('SgcRedemptionCode', sgcRedemptionCodeSchema);

export default SgcRedemptionCode;
