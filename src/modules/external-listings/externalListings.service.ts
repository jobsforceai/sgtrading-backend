import axios from 'axios';
import { config } from '../../config/config';
import redisClient from '../../config/redis';
import logger from '../../common/utils/logger';
import * as marketService from '../market/market.service';

const CACHE_KEY = 'external:listings';
const CACHE_TTL = 3600; // 1 hour in seconds

export const getCryptoListings = async () => {
  // 1. Try Cache
  try {
    const cached = await redisClient.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.error({ err: error }, 'Redis get failed for external listings');
  }

  // 2. Fetch from CoinMarketCap
  let listings: any[] = [];
  try {
    logger.info('Fetching fresh crypto listings from CoinMarketCap');
    const response = await axios.get(`${config.coinmarketcap.apiUrl}/v1/cryptocurrency/listings/latest`, {
      headers: {
        'X-CMC_PRO_API_KEY': config.coinmarketcap.apiKey,
      },
      params: {
        start: 1,
        limit: 20, // Fetch top 20
        convert: 'USD',
      },
    });

    listings = response.data.data;
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch from CoinMarketCap');
    // If CMC fails, return empty array or fallback? We return empty for now but log error.
    // Ideally we might want to still return our own coin even if CMC fails.
    listings = []; 
  }

  // 3. Inject "Our Coin" (SGC)
  try {
    // Fetch live internal price
    const sgcPrice = await marketService.fetchCurrentPrice('sgc') || 1.00; // Default to 1.00 if missing
    
    const ourCoin = {
      id: 999999, // Fake ID
      name: 'SGCoin',
      symbol: 'SGC',
      slug: 'sgcoin',
      cmc_rank: 0, // Top rank
      quote: {
        USD: {
          price: sgcPrice,
          percent_change_1h: 0, // TODO: Calculate if needed
          percent_change_24h: 0,
          percent_change_7d: 0,
          market_cap: 10000000, // Mock market cap
          volume_24h: 50000,
        }
      }
    };

    // Prepend our coin to the list
    listings.unshift(ourCoin);

  } catch (error) {
    logger.error({ err: error }, 'Failed to inject SGC coin data');
  }

  // 4. Cache Result
  if (listings.length > 0) {
    try {
      await redisClient.set(CACHE_KEY, JSON.stringify(listings), { EX: CACHE_TTL });
    } catch (error) {
      logger.error({ err: error }, 'Redis set failed for external listings');
    }
  }

  return listings;
};
