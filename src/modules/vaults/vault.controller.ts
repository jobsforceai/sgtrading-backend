import { Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import * as vaultService from './vault.service';
import { IAuthRequest } from '../auth/auth.types';
import { ApiError } from '../../common/errors/ApiError';
import InvestmentVault from './investmentVault.model';

export const createVault = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const vault = await vaultService.createVault(req.user!, req.body);
    res.status(httpStatus.CREATED).send(vault);
  } catch (error) {
    next(error);
  }
};

export const deposit = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { vaultId } = req.params;
    const { amountUsd, buyInsurance } = req.body;
    
    const result = await vaultService.depositIntoVault(req.user!, {
        vaultId,
        amountUsd,
        buyInsurance
    });
    res.status(httpStatus.OK).send(result);
  } catch (error) {
    next(error);
  }
};

export const activateVault = async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
      const { vaultId } = req.params;
      const vault = await vaultService.activateVault(req.user!, vaultId);
      res.status(httpStatus.OK).send(vault);
    } catch (error) {
      next(error);
    }
};

export const getVaults = async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
        const vaults = await InvestmentVault.find({ status: { $ne: 'CANCELLED' } })
            .populate('creatorId', 'fullName')
            .populate('botId', 'name strategy'); // Populate bot name and strategy
        res.status(httpStatus.OK).send(vaults);
    } catch (error) {
        next(error);
    }
};

export const getVaultById = async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
        const { vaultId } = req.params;
        const vault = await InvestmentVault.findById(vaultId).populate('creatorId', 'fullName').populate('botId', 'name strategy');
        if (!vault) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Vault not found');
        }
        res.status(httpStatus.OK).send(vault);
    } catch (error) {
        next(error);
    }
};

export const getMyParticipations = async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
        const participations = await vaultService.getUserParticipations(req.user!.id);
        res.status(httpStatus.OK).send(participations);
    } catch (error) {
        next(error);
    }
};

export const withdrawFromVault = async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
        const { vaultId } = req.params;
        const result = await vaultService.withdrawFromFundingVault(req.user!, vaultId);
        res.status(httpStatus.OK).send(result);
    } catch (error) {
        next(error);
    }
};
