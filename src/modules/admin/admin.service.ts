import PriceScenario, { IPriceScenario } from './priceScenario.model';
import Instrument from '../market/instrument.model';
import { ApiError } from '../../common/errors/ApiError';
import httpStatus from 'http-status';
import redisClient from '../../config/redis';
import { BINANCE_SYMBOLS, STOCK_SYMBOLS, SYNTHETIC_SYMBOLS } from '../market/market.config';

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

// --- System Health & Management ---

export const getSystemHealth = async () => {
  const instruments = await Instrument.find({});
  const now = Date.now();
  
  const healthData = await Promise.all(instruments.map(async (inst) => {
    const symbol = inst.symbol.toLowerCase();
    let provider = 'UNKNOWN';
    
    // Determine provider key
    if (SYNTHETIC_SYMBOLS.includes(symbol)) provider = 'SYNTHETIC';
    else if (BINANCE_SYMBOLS.includes(symbol)) provider = 'BINANCE';
    else if (STOCK_SYMBOLS.includes(symbol)) provider = 'ALPACA';
    else if (inst.type === 'FOREX' || inst.type === 'COMMODITY') provider = 'OANDA'; // Fallback logic
    else provider = 'TWELVEDATA'; // Or Yahoo fallback

    // Check Redis for latest tick
    // Note: Keys in redis are uppercase for some (OANDA/ALPACA) or specific format
    // We try a few common patterns
    let redisKey = `price:${provider}:${symbol}`; 
    // Specific fixes for key consistency
    if (provider === 'OANDA' || provider === 'ALPACA') redisKey = `price:${provider}:${symbol}`; // worker keys are lowercase symbol usually, checking worker code...
    // binance.ws.worker.ts: price:BINANCE:btcusdt
    // oanda.ws.worker.ts: price:OANDA:eur_usd
    // alpaca.ws.worker.ts: price:ALPACA:aapl
    
    const tickData = await redisClient.get(redisKey);
    let lastUpdate = 0;
    let price = 0;

    if (tickData) {
      const tick = JSON.parse(tickData);
      lastUpdate = tick.ts;
      price = tick.last;
    }

    const latency = now - lastUpdate;
    let status = 'OFFLINE';
    
    if (lastUpdate > 0) {
        if (latency < 60000) status = 'ONLINE'; // < 1 min
        else if (latency < 300000) status = 'DEGRADED'; // < 5 mins
    }

    return {
      symbol: inst.symbol,
      type: inst.type,
      provider,
      status,
      isEnabled: inst.isEnabled,
      lastPrice: price,
      lastUpdate: lastUpdate > 0 ? new Date(lastUpdate).toISOString() : null,
      latencyMs: lastUpdate > 0 ? latency : -1
    };
  }));

  const onlineCount = healthData.filter(h => h.status === 'ONLINE').length;
  const offlineCount = healthData.filter(h => h.status === 'OFFLINE').length;

  return {
    summary: {
      total: instruments.length,
      online: onlineCount,
      degraded: healthData.length - onlineCount - offlineCount,
      offline: offlineCount
    },
    details: healthData
  };
};

export const toggleInstrument = async (symbol: string, isEnabled: boolean) => {
  const instrument = await Instrument.findOne({ symbol });
  if (!instrument) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instrument not found');
  }
  instrument.isEnabled = isEnabled;
  await instrument.save();
  
  // Invalidate User Cache immediately so the asset disappears/reappears for users
  await redisClient.del('instruments:all');
  
  return instrument;
};

export const testInstrumentConnection = async (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();
  const instrument = await Instrument.findOne({ symbol: lowerSymbol });
  if (!instrument) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instrument not found');
  }

  // 1. Trigger Subscription
  await redisClient.publish('market-control-channel', JSON.stringify({ action: 'subscribe', symbol: lowerSymbol }));

  // 2. Wait for data to arrive (3 seconds)
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 3. Check Redis
  let provider = 'UNKNOWN';
  if (SYNTHETIC_SYMBOLS.includes(lowerSymbol)) provider = 'SYNTHETIC';
  else if (BINANCE_SYMBOLS.includes(lowerSymbol)) provider = 'BINANCE';
  else if (STOCK_SYMBOLS.includes(lowerSymbol)) provider = 'ALPACA';
  else if (instrument.type === 'FOREX' || instrument.type === 'COMMODITY') provider = 'OANDA';
  else provider = 'TWELVEDATA';

  // Determine Redis key (same logic as getSystemHealth)
  // Usually price:PROVIDER:symbol
  const redisKey = `price:${provider}:${lowerSymbol}`;
  
  const tickData = await redisClient.get(redisKey);
  let success = false;
  let tick = null;

  if (tickData) {
    tick = JSON.parse(tickData);
    const now = Date.now();
    // If data is fresher than 5 seconds (allow some buffer for the wait time), it means it just arrived.
    if (now - tick.ts < 5000) {
      success = true;
    }
  }

  // 4. Cleanup: Unsubscribe (we don't want to keep it open if no user is watching)
  // However, if a user IS watching, this might interrupt them?
  // The socketServer handles reference counting. The worker handles subscribe/unsubscribe.
  // If we send 'unsubscribe', the worker will close it. 
  // IF there are real users, the socketServer isn't re-sending subscribe constantly.
  // SAFEGUARD: The worker usually checks active subscriptions? 
  // Actually, our simple worker just closes on 'unsubscribe'.
  // BETTER LOGIC: We should only unsubscribe if we forced it open.
  // But we can't know.
  // COMPROMISE: For an Admin Test, it's acceptable to momentarily unsubscribe. 
  // OR, better: Don't unsubscribe. Let the worker keep it open. 
  // Ideally, we'd rely on the socketServer's heartbeat or something to clean up.
  // For now, to be safe and avoid "Admin broke the chart", we will NOT unsubscribe. 
  // The only downside is the backend keeps fetching data for this symbol until restart or manual close. 
  // This is better than breaking live users.
  
  // await redisClient.publish('market-control-channel', JSON.stringify({ action: 'unsubscribe', symbol: lowerSymbol }));

  return { success, tick, provider };
};

export const testAllConnections = async () => {
  const instruments = await Instrument.find({ isEnabled: true });
  const now = Date.now();

  // 1. Trigger Subscription for ALL
  // We can blast these out, Redis is fast.
  const subscribePromises = instruments.map(inst => 
    redisClient.publish('market-control-channel', JSON.stringify({ action: 'subscribe', symbol: inst.symbol.toLowerCase() }))
  );
  await Promise.all(subscribePromises);

  // 2. Wait for data (5 seconds)
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 3. Check Results
  const results = await Promise.all(instruments.map(async (inst) => {
    const symbol = inst.symbol.toLowerCase();
    let provider = 'UNKNOWN';
    if (SYNTHETIC_SYMBOLS.includes(symbol)) provider = 'SYNTHETIC';
    else if (BINANCE_SYMBOLS.includes(symbol)) provider = 'BINANCE';
    else if (STOCK_SYMBOLS.includes(symbol)) provider = 'ALPACA';
    else if (inst.type === 'FOREX' || inst.type === 'COMMODITY') provider = 'OANDA';
    else provider = 'TWELVEDATA';

    const redisKey = `price:${provider}:${symbol}`;
    const tickData = await redisClient.get(redisKey);
    let success = false;

    if (tickData) {
      const tick = JSON.parse(tickData);
      const tickAge = Date.now() - tick.ts;
      // If data is fresher than 10 seconds (allowing for some drift/delay), consider it a success
      if (tickAge < 10000) {
        success = true;
      }
    }
    return { symbol, success, provider };
  }));

  const successCount = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).map(r => ({ symbol: r.symbol, provider: r.provider }));

  return {
    total: instruments.length,
    success: successCount,
    failedCount: failed.length,
    failedSymbols: failed
  };
};
