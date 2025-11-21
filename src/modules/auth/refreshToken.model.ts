import { Schema, model, Document } from 'mongoose';
import { IUser } from '../users/user.model';

export interface IRefreshToken extends Document {
  token: string;
  user: IUser['_id'];
  expires: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>({
  token: { type: String, required: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expires: { type: Date, required: true },
}, {
  timestamps: true,
});

const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);

export default RefreshToken;
