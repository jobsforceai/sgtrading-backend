import { Request } from 'express';
import { IUser } from '../users/user.model';

export interface IRegisterRequestBody {
  email: string;
  fullName: string;
  password?: string;
}

export interface ILoginRequestBody {
  email: string;
  otp: string;
  password?: string; // Kept for compatibility, but logic will use OTP
}

export interface IAuthRequest extends Request {
  user?: IUser;
}
