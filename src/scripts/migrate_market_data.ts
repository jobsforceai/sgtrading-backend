import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import logger from '../common/utils/logger';

// Load local environment variables for SOURCE
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const SOURCE_URI = process.env.MONGO_URI;
const DEST_URI = 'abv';

if (!SOURCE_URI) {
    console.error('❌ SOURCE_URI (MONGO_URI) is not defined in .env');
    process.exit(1);
}

const migrate = async () => {
    console.log('--- MARKET DATA MIGRATION STARTED ---');
    console.log(`Source: Local (${SOURCE_URI})`);
    console.log(`Dest:   Live Atlas Cluster`);

    const sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
    const destConn = await mongoose.createConnection(DEST_URI).asPromise();

    console.log('✅ Connected to both databases.');

    try {
        // --- 1. MIGRATE INSTRUMENTS ---
        console.log('\n[1/2] Migrating Instruments...');
        const sourceInstruments = await sourceConn.collection('instruments').find({}).toArray();
        console.log(`Found ${sourceInstruments.length} instruments in source.`);

        if (sourceInstruments.length > 0) {
            const destInstrColl = destConn.collection('instruments');
            // Clear destination first to ensure exact sync?
            // Or upsert? Let's upsert to be safe, using 'symbol' as key.
            
            let instrCount = 0;
            for (const doc of sourceInstruments) {
                const { _id, ...instrData } = doc; // Strip _id
                // @ts-ignore
                await destInstrColl.updateOne(
                    { symbol: doc.symbol },
                    { $set: instrData },
                    { upsert: true }
                );
                instrCount++;
            }
            console.log(`✅ Upserted ${instrCount} instruments to Live DB.`);
        }

        // --- 2. MIGRATE CANDLES ---
        console.log('\n[2/2] Migrating Candles (This may take time)...');
        const sourceCandleColl = sourceConn.collection('candles');
        const destCandleColl = destConn.collection('candles');

        const totalCandles = await sourceCandleColl.countDocuments();
        console.log(`Total Candles to transfer: ${totalCandles}`);

        const BATCH_SIZE = 5000;
        let processed = 0;
        const cursor = sourceCandleColl.find({});

        let batch = [];
        for await (const doc of cursor) {
            // Remove _id to allow fresh insertion or handle duplications?
            // If we keep _id, we might conflict if Live DB has different data.
            // But we want to preserve the exact data.
            // Strategy: Upsert based on compound key (symbol + resolution + time)
            
            // Optimization: Delete _id from doc so Mongo doesn't throw "immutable field" error on update
            // actually, replaceOne or updateOne with upsert is safer.
            
            // For massive speed, we usually use bulkWrite.
            
            const { _id, ...docData } = doc; // Strip _id
            
            batch.push({
                updateOne: {
                    filter: { symbol: doc.symbol, resolution: doc.resolution, time: doc.time },
                    update: { $set: docData },
                    upsert: true
                }
            });

            if (batch.length >= BATCH_SIZE) {
                await destCandleColl.bulkWrite(batch, { ordered: false });
                processed += batch.length;
                process.stdout.write(`\rProgress: ${processed} / ${totalCandles} (${Math.round(processed/totalCandles*100)}%)`);
                batch = [];
            }
        }

        if (batch.length > 0) {
            await destCandleColl.bulkWrite(batch, { ordered: false });
            processed += batch.length;
            console.log(`\rProgress: ${processed} / ${totalCandles} (100%)`);
        }

        console.log('\n✅ Candle migration complete.');

    } catch (error) {
        console.error('\n❌ Migration Failed:', error);
    } finally {
        await sourceConn.close();
        await destConn.close();
        console.log('Connections closed.');
        process.exit(0);
    }
};

migrate();
