import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../users/user.model';
import { ILoginRequestBody, IRegisterRequestBody } from './auth.types';
import { ApiError } from '../../common/errors/ApiError';
import httpStatus from 'http-status';
import { config } from '../../config/config';
import { createWalletForUser } from '../wallets/wallet.service';
import { generateOtp } from '../../common/utils/crypto';
import logger from '../../common/utils/logger';
import RefreshToken from './refreshToken.model';
import moment from 'moment';
import fs from 'fs';


export const loginWithPassword = async (email: string, passwordReq: string): Promise<IUser> => {
  const user = await User.findOne({ email });
  if (!user || !user.passwordHash) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or password');
  }

  const isPasswordMatch = await bcrypt.compare(passwordReq, user.passwordHash);
  if (!isPasswordMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or password');
  }

  // For admin users, ensure they have the ADMIN role if this endpoint is strictly for admins
  // if (!user.roles.includes('ADMIN')) {
  //   throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  // }

  return user;
};


export const registerUser = async (userData: IRegisterRequestBody): Promise<IUser> => {
  logger.info(`Registration attempt for email: ${userData.email}`);

  if (!userData.password) {
    logger.error('Registration failed: Password is required');
    throw new ApiError(httpStatus.BAD_REQUEST, 'Password is required');
  }

  const { email, fullName, password } = userData;

  if (await User.findOne({ email })) {
    logger.warn(`Registration failed: User with email ${email} already exists`);
    throw new ApiError(httpStatus.CONFLICT, 'User with this email already exists');
  }

  logger.info(`Step 1: Hashing password for ${email}`);
  // 1. Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  logger.info(`Step 1: Password hashed for ${email}`);

  logger.info(`Step 2: Creating user record for ${email}`);
  // 2. Create user record
  const user = await User.create({
    email,
    fullName,
    passwordHash,
  });
  logger.info(`Step 2: User record created for ${email} with id: ${user.id}`);

  logger.info(`Step 3: Creating trading wallet for user ${user.id}`);
  // 3. Create trading wallet
  await createWalletForUser(user);
  logger.info(`Step 3: Trading wallet created for user ${user.id}`);

  logger.info(`User ${email} registered successfully`);
  return user;
};

export const requestOtp = async (email: string): Promise<void> => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await user.save();

  // In a real application, send the OTP via email
  // For now, write to a file
  fs.appendFileSync('otp.log', `OTP for ${email}: ${otp}\n`);
};

export const verifyOtpAndLogin = async (loginData: ILoginRequestBody): Promise<IUser> => {
  const { email, otp } = loginData;

  const user = await User.findOne({ email });
  if (!user || !user.otp || user.otp !== otp) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or OTP');
  }

  if (user.otpExpires && user.otpExpires < new Date()) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'OTP has expired');
  }

  // Clear OTP after successful verification
  user.otp = null;
  user.otpExpires = null;
  await user.save();

  return user;
};

export const generateAuthTokens = async (user: IUser) => {
  const accessToken = jwt.sign({ sub: user.id }, config.jwt.secret, {
    expiresIn: config.jwt.accessTokenExpiration,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign({ sub: user.id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTokenExpiration,
  } as jwt.SignOptions);

  await RefreshToken.create({
    token: refreshToken,
    user: user.id,
    expires: moment().add(config.jwt.refreshTokenExpiration, 'days').toDate(),
  });

  return { accessToken, refreshToken };
};

export const refreshAuth = async (token: string) => {
  try {
    const refreshTokenDoc = await RefreshToken.findOne({ token }).populate('user');
    if (!refreshTokenDoc || !refreshTokenDoc.user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token not found');
    }

    if (moment().isAfter(refreshTokenDoc.expires)) {
      await refreshTokenDoc.deleteOne();
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token expired');
    }

    await refreshTokenDoc.deleteOne();
    return generateAuthTokens(refreshTokenDoc.user as unknown as IUser);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid refresh token');
  }
};

export const logout = async (token: string) => {
  const refreshTokenDoc = await RefreshToken.findOne({ token });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Refresh token not found');
  }
  await refreshTokenDoc.deleteOne();
};
