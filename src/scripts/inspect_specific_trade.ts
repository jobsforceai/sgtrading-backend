import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Trade from '../modules/trading/trade.model';

const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const inspectTrade = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);

    const tradeId = '692b31bb075ee057564faa6f';
    console.log(`Inspecting Trade: ${tradeId}`);

    const trade = await Trade.findById(tradeId);
    
    if (!trade) {
        console.log('❌ Trade NOT FOUND in database.');
    } else {
        console.log('--- TRADE DETAILS ---');
        console.log(`Status:      ${trade.status}`);
        console.log(`Outcome:     ${trade.outcome}`);
        console.log(`Open At:     ${trade.openAt}`);
        console.log(`Expires At:  ${trade.expiresAt}`);
        console.log(`Settled At:  ${trade.settledAt}`);
        console.log(`Exit Price:  ${trade.exitPrice}`);
        
        if (trade.status === 'SETTLED') {
            console.log('\n✅ CONCLUSION: Trade IS settled in the DB.');
            console.log('If frontend shows it as OPEN, the frontend is displaying STALE data.');
        } else {
            console.log('\n⚠️ CONCLUSION: Trade is still OPEN in the DB.');
        }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

inspectTrade();
