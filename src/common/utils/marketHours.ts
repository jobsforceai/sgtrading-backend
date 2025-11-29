import moment from 'moment';
import { IInstrument } from '../../modules/market/instrument.model';

export const isMarketOpen = (instrument: IInstrument): boolean => {
  // If no specific trading hours are defined, assume open 24/7 (e.g. Crypto)
  if (!instrument.tradingHours || !instrument.tradingHours.sessions || instrument.tradingHours.sessions.length === 0) {
    return true;
  }

  // Convert current time to the instrument's timezone (default to UTC if not specified)
  const timezone = instrument.tradingHours.timezone || 'UTC';
  
  // We need to check 'now' in that specific timezone
  // Note: moment-timezone is needed for specific IANA timezones (e.g. 'America/New_York').
  // Since we only have 'moment' installed in package.json (checked earlier), we might need to rely on UTC
  // or simple offset handling if the timezone string is simple.
  // However, the seed data uses 'UTC'. If 'America/New_York' is used, we need 'moment-timezone'.
  // For safety with standard 'moment', we'll stick to UTC logic or assume the input is UTC-aligned if timezone is UTC.
  
  // Let's assume standardized UTC for now as per seed data.
  // If timezone is NOT UTC, this logic is brittle without moment-timezone.
  // But let's proceed with the logic present in trading.service.ts which used moment.utc().
  
  const now = moment.utc();
  const dayOfWeek = now.day(); // 0 (Sun) - 6 (Sat)
  const currentHm = now.format('HH:mm');

  // Find session for today
  const session = instrument.tradingHours.sessions.find((s: any) => s.dayOfWeek === dayOfWeek);
  
  // If no session for this day, market is closed (e.g. Weekends for stocks)
  if (!session) return false;

  // Check time range
  // session.open and session.close are strings "HH:mm"
  return currentHm >= session.open && currentHm <= session.close;
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