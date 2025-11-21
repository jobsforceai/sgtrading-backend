import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  fullName: string;
  passwordHash: string;
  roles: ('USER' | 'ADMIN' | 'PARTNER')[];
  kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  otp?: string | null;
  otpExpires?: Date | null;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  fullName: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  roles: { type: [String], enum: ['USER', 'ADMIN', 'PARTNER'], default: ['USER'] },
  kycStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  otp: { type: String, default: null },
  otpExpires: { type: Date, default: null },
}, {
  timestamps: true,
});

const User = model<IUser>('User', userSchema);

export default User;
