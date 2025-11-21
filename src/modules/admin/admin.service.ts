import PriceScenario, { IPriceScenario } from './priceScenario.model';
import { ApiError } from '../../common/errors/ApiError';
import httpStatus from 'http-status';

interface ICreateScenarioBody {
  symbol: string;
  startTime: Date | string;
  endTime: Date | string;
  startPrice: number;
  endPrice: number;
  highPrice: number;
  lowPrice: number;
}

export const createPriceScenario = async (data: ICreateScenarioBody): Promise<IPriceScenario> => {
  // Check for overlapping scenarios for the same symbol
  const overlap = await PriceScenario.findOne({
    symbol: data.symbol,
    isActive: true,
    $or: [
      { startTime: { $lte: data.endTime }, endTime: { $gte: data.startTime } }
    ]
  });

  if (overlap) {
    throw new ApiError(httpStatus.CONFLICT, 'A price scenario already exists for this time range');
  }

  return PriceScenario.create(data);
};

export const getPriceScenarios = async (symbol?: string): Promise<IPriceScenario[]> => {
  const filter = symbol ? { symbol: symbol.toUpperCase() } : {};
  return PriceScenario.find(filter).sort({ startTime: -1 });
};

export const deletePriceScenario = async (id: string): Promise<void> => {
  const scenario = await PriceScenario.findById(id);
  if (!scenario) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Price scenario not found');
  }
  await scenario.deleteOne();
};

export const getActiveScenario = async (symbol: string): Promise<IPriceScenario | null> => {
  const now = new Date();
  // 1. Try to find a currently active scenario
  const active = await PriceScenario.findOne({
    symbol: symbol.toUpperCase(),
    isActive: true,
    startTime: { $lte: now },
    endTime: { $gte: now },
  });

  if (active) {
    return active;
  }

  // 2. Fallback: Find the most recently ended scenario to use as a template
  const recent = await PriceScenario.findOne({
    symbol: symbol.toUpperCase(),
    isActive: true,
  }).sort({ endTime: -1 }); // Get the latest one

  return recent;
};
