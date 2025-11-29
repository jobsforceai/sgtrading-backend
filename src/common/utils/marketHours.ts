import moment from 'moment';
import { IInstrument } from '../../modules/market/instrument.model';

import logger from '../../common/utils/logger';

export const isMarketOpen = (instrument: IInstrument): boolean => {
  // If no specific trading hours are defined, assume open 24/7 (e.g. Crypto)
  if (!instrument.tradingHours || !instrument.tradingHours.sessions || instrument.tradingHours.sessions.length === 0) {
    return true;
  }

  const timezone = instrument.tradingHours.timezone || 'UTC';
  const now = moment.utc(); // Use UTC as standardized
  const dayOfWeek = now.day(); // 0 (Sun) - 6 (Sat)
  const currentHm = now.format('HH:mm');

  // Debug logging for specific instrument (e.g., eur_usd)
  if (instrument.symbol === 'eur_usd') {
      logger.debug({ 
          symbol: instrument.symbol,
          currentTime: now.toISOString(),
          dayOfWeek,
          currentHm,
          tradingHours: instrument.tradingHours,
          timezone // Should be UTC
      }, 'isMarketOpen check for EUR/USD');
  }

  // Find session for today
  const session = instrument.tradingHours.sessions.find((s: any) => s.dayOfWeek === dayOfWeek);
  
  // If no session for this day, market is closed (e.g. Weekends for stocks)
  if (!session) {
      if (instrument.symbol === 'eur_usd') logger.debug({ symbol: instrument.symbol }, 'No session found for today. Market Closed.');
      return false;
  }

  // Check time range
  const marketOpen = currentHm >= session.open && currentHm <= session.close;
  if (instrument.symbol === 'eur_usd') {
      logger.debug({ 
          symbol: instrument.symbol,
          sessionOpen: session.open,
          sessionClose: session.close,
          marketOpen
      }, 'EUR/USD session check result');
  }
  return marketOpen;
};

/**
 * Checks if a specific historical timestamp was during market hours.
 * Useful for gap filling logic.
 */
export const wasMarketOpen = (instrument: IInstrument, timestamp: Date): boolean => {
    if (!instrument.tradingHours || !instrument.tradingHours.sessions || instrument.tradingHours.sessions.length === 0) {
        return true;
    }

    const time = moment.utc(timestamp);
    const dayOfWeek = time.day();
    const timeHm = time.format('HH:mm');

    const session = instrument.tradingHours.sessions.find((s: any) => s.dayOfWeek === dayOfWeek);
    if (!session) return false;

    return timeHm >= session.open && timeHm <= session.close;
};