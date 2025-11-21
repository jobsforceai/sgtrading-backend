import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import * as authService from './auth.service';
import { IRegisterRequestBody, ILoginRequestBody } from './auth.types';
import logger from '../../common/utils/logger';

export const loginPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const user = await authService.loginWithPassword(email, password);
    const tokens = await authService.generateAuthTokens(user);
    res.send({ user, tokens });
  } catch (error) {
    next(error);
  }
};


export const register = async (req: Request, res: Response, next: NextFunction) => {
  logger.info(`Received registration request with body: ${JSON.stringify(req.body)}`);
  try {
    const user = await authService.registerUser(req.body as IRegisterRequestBody);
    // We don't return tokens on registration anymore
    res.status(httpStatus.CREATED).send({ user });
  } catch (error) {
    logger.error(`Registration failed: ${error}`);
    next(error);
  }
};

export const requestOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.requestOtp(req.body.email);
    res.status(httpStatus.OK).send({ message: 'OTP sent successfully' });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.verifyOtpAndLogin(req.body as ILoginRequestBody);
    const tokens = await authService.generateAuthTokens(user);
    res.send({ user, tokens });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens = await authService.refreshAuth(req.body.refreshToken);
    res.send({ ...tokens });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
};