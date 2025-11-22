import { io, Socket } from 'socket.io-client';
import { BINANCE_SYMBOLS } from '../modules/market/market.config';
import { config } from '../config/config';

// CONFIGURATION: EXTREME LOAD
const CLIENT_COUNT = 1000; // Simulating 1000 concurrent users
const DURATION_SECONDS = 45; // Run longer to see stability
const API_URL = `http://localhost:${config.port}`;

// ONLY CRYPTO (Since stocks/forex are closed/low volume)
const allSymbols = [...BINANCE_SYMBOLS];

console.log(`Starting EXTREME Stress Test: ${CLIENT_COUNT} users connecting to ${API_URL}`);
console.log(`Target Symbols Pool: ${allSymbols.length} Crypto symbols`);

let connectedCount = 0;
let totalTicksReceived = 0;
const clients: Socket[] = [];

const startTest = async () => {
  for (let i = 0; i < CLIENT_COUNT; i++) {
    // Very fast ramp up (2ms delay)
    await new Promise(r => setTimeout(r, 2));

    const socket = io(API_URL, {
      transports: ['websocket'],
      forceNew: true,
    });

    socket.on('connect', () => {
      connectedCount++;
      // Pick a random symbol to subscribe to
      const symbol = allSymbols[Math.floor(Math.random() * allSymbols.length)];
      socket.emit('market:subscribe', symbol);
    });

    socket.on('market:tick', (data) => {
      totalTicksReceived++;
    });

    socket.on('disconnect', () => {
      connectedCount--;
    });

    clients.push(socket);
    
    if (i % 100 === 0) {
        process.stdout.write(`\rInitiated: ${i + 1}/${CLIENT_COUNT} | Active: ${connectedCount}`);
    }
  }
  console.log(`\n✅ All ${CLIENT_COUNT} clients initiated.`);

  // Monitor loop
  const startTime = Date.now();
  const interval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (totalTicksReceived / elapsed).toFixed(1);
    
    process.stdout.write(`\r[${elapsed.toFixed(0)}s] Active Users: ${connectedCount} | Total Ticks: ${totalTicksReceived} | Rate: ${rate} ticks/sec`);

    if (elapsed >= DURATION_SECONDS) {
      clearInterval(interval);
      finishTest();
    }
  }, 1000);
};

const finishTest = () => {
  console.log('\n\n--- Test Complete ---');
  console.log(`Total Clients: ${CLIENT_COUNT}`);
  console.log(`Active at End: ${connectedCount}`);
  console.log(`Total Ticks Processed: ${totalTicksReceived}`);
  console.log(`Avg Message Rate: ${(totalTicksReceived / DURATION_SECONDS).toFixed(1)} ticks/sec`);
  
  console.log('Disconnecting clients...');
  clients.forEach(c => c.close());
  console.log('Done.');
  process.exit(0);
};

startTest();
