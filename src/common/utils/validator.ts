import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors/ApiError';
import httpStatus from 'http-status';

export const validate = (schema: z.ZodObject<any, any>) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    if (error instanceof Error) {
      next(new ApiError(httpStatus.BAD_REQUEST, error.message));
    } else {
      next(new ApiError(httpStatus.BAD_REQUEST, 'Invalid input'));
    }
  }
};
