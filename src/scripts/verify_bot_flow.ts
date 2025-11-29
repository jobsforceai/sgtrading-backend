import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../modules/users/user.model';
import Bot from '../modules/bots/bot.model';
import * as botService from '../modules/bots/bot.service';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runVerification = async () => {
  try {
    logger.info('--- STARTING BOT FLOW VERIFICATION ---');
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);

    // 1. Setup User
    const email = `bot_flow_${Date.now()}@test.com`;
    const user = await User.create({ email, fullName: 'Bot Flow Tester', passwordHash: 'secret' });
    logger.info(`👤 Created Test User: ${user.id}`);

    // 2. Fetch Initial Lists (Should be empty)
    const initialPrivate = await botService.getBots(user);
    logger.info(`[Initial] Private Bots: ${initialPrivate.length} (Expected: 0)`);
    
    // 3. Create Private Bot
    logger.info('\n[Action] Creating PRIVATE Bot...');
    const privateBotData = {
        name: "My Private Bot",
        strategy: "RSI_STRATEGY",
        assets: ["btcusdt"],
        visibility: "PRIVATE",
        config: {
            tradeAmount: 10,
            expirySeconds: 60,
            maxConcurrentTrades: 1,
            stopLossAmount: 0,
            takeProfitAmount: 0
        },
        parameters: { period: 14 }
    };
    // @ts-ignore
    const privateBot = await botService.createBot(user, privateBotData);
    logger.info(`✅ Created Private Bot: ${privateBot.id}`);

    // 4. Create Public Bot
    logger.info('\n[Action] Creating PUBLIC Bot...');
    const publicBotData = {
        name: "Community Master Bot",
        strategy: "MACD_STRATEGY",
        assets: ["ethusdt"],
        visibility: "PUBLIC",
        config: {
            tradeAmount: 50,
            expirySeconds: 300,
            stopLossAmount: 1000,
            takeProfitAmount: 2000
        },
        parameters: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }
    };
    // @ts-ignore
    const publicBot = await botService.createBot(user, publicBotData);
    // Manually activate it because getPublicBots only returns ACTIVE bots
    publicBot.status = 'ACTIVE'; 
    await publicBot.save();
    logger.info(`✅ Created Public Bot: ${publicBot.id} (Set to ACTIVE)`);

    // 5. Fetch Lists Again
    logger.info('\n--- VERIFYING LISTS ---');
    
    const myBots = await botService.getBots(user);
    console.log(`\n[My Bots] Count: ${myBots.length} (Expected: 2)`);
    myBots.forEach(b => console.log(` - ${b.name} [${b.visibility}] Status: ${b.status}`));

    const publicBots = await botService.getPublicBots();
    console.log(`\n[Public Market] Count: ${publicBots.length} (Expected >= 1)`);
    const foundMyPublic = publicBots.find(b => b.id === publicBot.id);
    if (foundMyPublic) {
        console.log(` ✅ Found my public bot in the marketplace.`);
    } else {
        console.error(` ❌ Did NOT find my public bot in the marketplace.`);
    }

    // 6. Cleanup
    await User.deleteOne({ _id: user.id });
    await Bot.deleteMany({ userId: user.id });
    logger.info('\nCleanup complete.');

  } catch (error) {
    logger.error({ err: error }, 'Verification Failed');
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

runVerification();
