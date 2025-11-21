# 2️⃣ Frontend Doc – Dynamic Real-Time Chart

Our backend now uses a scalable, on-demand data system. Instead of broadcasting all data to everyone, the frontend must now **subscribe** to the specific symbols it wants to receive.

---

## 1. Symbol Formats (Crucial!)

You must use the correct symbol format when subscribing and fetching data.

*   **For Crypto:** Use **Binance lowercase symbols** (e.g., `btcusdt`, `ethusdt`).
*   **For Forex:** Use **OANDA underscore symbols** (e.g., `eur_usd`, `gbp_usd`).
*   **For Stocks/Commodities:** Use **Alpaca lowercase symbols** (e.g., `aapl`, `tsla`, `gld`).

When you get data back from the WebSocket (`market:tick` event), the `symbol` will be in this **internal format**.

---

## 2. Frontend WebSocket Hook (New Subscription Model)

The frontend now controls what data the backend fetches.

```bash
npm install socket.io-client
```

Create a new, more powerful hook to manage subscriptions and receive live data.

```ts
// app/hooks/useSubscriptionMarketData.ts
'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export type MarketTick = {
  symbol: string; // This will be in the internal format (e.g., 'btcusdt', 'eur_usd', 'aapl')
  last: number;
  ts: number;
};

const socket: Socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
  transports: ['websocket'],
  autoConnect: false, // We will connect manually
});

export const useSubscriptionMarketData = (symbols: string[]) => {
  const [ticks, setTicks] = useState<Record<string, MarketTick>>({});
  const subscribedSymbolsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    socket.on('connect', () => {
      console.log('Connected to market WS', socket.id);
      // Re-subscribe to all symbols on reconnection
      subscribedSymbolsRef.current.forEach(symbol => {
        socket.emit('market:subscribe', symbol);
      });
    });

    socket.on('market:tick', (tick: MarketTick) => {
      setTicks(prevTicks => ({
        ...prevTicks,
        [tick.symbol]: tick,
      }));
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from market WS');
    });

    // Subscribe to the symbols passed to the hook
    symbols.forEach(symbol => {
      if (!subscribedSymbolsRef.current.has(symbol)) {
        socket.emit('market:subscribe', symbol);
        subscribedSymbolsRef.current.add(symbol);
      }
    });

    return () => {
      // Unsubscribe from symbols that are no longer needed
      symbols.forEach(symbol => {
        socket.emit('market:unsubscribe', symbol);
        subscribedSymbolsRef.current.delete(symbol);
      });

      // Optional: disconnect if no subscriptions are left anywhere in the app
      // This requires a more advanced global state management
    };
  }, [symbols]);

  return ticks;
};
```

---

## 3. Chart Page Implementation

Your chart page will now use this hook to subscribe to the desired symbol and update the chart.

```tsx
// app/(dashboard)/trade/[symbol]/page.tsx
'use client';

import { ChartComponent } from '@/components/ChartComponent';
import { useSubscriptionMarketData } from '@/hooks/useSubscriptionMarketData';
import { useEffect, useState } from 'react';
import type { CandlestickData } from 'lightweight-charts';

// You will need a mapping from the URL-friendly symbol to the backend subscription symbol
const symbolMap: Record<string, string> = {
  'BTCUSDT': 'btcusdt',
  'EURUSD': 'eur_usd',
  'AAPL': 'aapl', // Example for a stock
  'GLD': 'gld',   // Example for a commodity
};

// Assume you have a function to fetch historical data
const fetchHistoricalCandles = async (symbol: string): Promise<CandlestickData[]> => {
  // ... implementation to call GET /api/v1/markets/candles
};

export default function TradePage({ params }: { params: { symbol: string } }) {
  const backendSymbol = symbolMap[params.symbol.toUpperCase()];
  const liveTicks = useSubscriptionMarketData([backendSymbol]);
  
  const [seriesData, setSeriesData] = useState<CandlestickData[]>([]);

  // 1. Load historical data on initial render
  useEffect(() => {
    const loadData = async () => {
      // Use backendSymbol for fetching historical data
      const historicalData = await fetchHistoricalCandles(backendSymbol);
      setSeriesData(historicalData);
    };
    loadData();
  }, [backendSymbol]); // Depend on backendSymbol

  // 2. Update the last candle with live ticks
  useEffect(() => {
    const latestTick = liveTicks[backendSymbol]; // Use backendSymbol for lookup
    if (!latestTick || seriesData.length === 0) return;

    setSeriesData(prevData => {
      const newData = [...prevData];
      const lastCandle = newData[newData.length - 1];
      const tickTime = Math.floor(latestTick.ts / 1000);

      if (tickTime > lastCandle.time) {
        // Create a new candle
        newData.push({
          time: tickTime,
          open: latestTick.last,
          high: latestTick.last,
          low: latestTick.last,
          close: latestTick.last,
        });
      } else {
        // Update the last candle
        lastCandle.close = latestTick.last;
        lastCandle.high = Math.max(lastCandle.high, latestTick.last);
        lastCandle.low = Math.min(lastCandle.low, latestTick.last);
      }
      return newData;
    });
  }, [liveTicks, backendSymbol, seriesData.length]); // Depend on backendSymbol

  return (
    <div className="h-[400px] w-full">
      <ChartComponent
        data={seriesData}
        chartType="Candlestick"
      />
    </div>
  );
}
```

---

## Summary for Frontend Team

1.  **One Symbol Format:** Use the internal backend symbol format for **all** interactions:
    *   WebSocket subscriptions (`market:subscribe`).
    *   Fetching historical data (`GET /api/v1/markets/candles`).
    *   The format is `btcusdt` for crypto, `eur_usd` for forex, and `aapl` for stocks/commodities.
2.  **Connect and Subscribe:** Use the `useSubscriptionMarketData` hook with the internal symbols.
3.  **Listen for Ticks:** The `market:tick` event will return the `symbol` in its internal format.
4.  **Map to Display Names:** Fetch the instrument list from `GET /api/v1/markets/instruments` to map the internal symbols to user-friendly `displayName` values.
5.  **Unsubscribe:** The hook handles this automatically.
6.  **Build Your Chart:** Use the internal symbols to fetch historical data and update the chart with live ticks.