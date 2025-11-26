import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import InvestmentVault from './src/modules/vaults/investmentVault.model';
import VaultParticipation from './src/modules/vaults/vaultParticipation.model';
import logger from './src/common/utils/logger';

const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const repairVaultData = async () => {
  if (!MONGO_URI) {
    console.error('MONGO_URI is not defined.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    console.log('--- STARTING VAULT DATA REPAIR ---');

    const vaults = await InvestmentVault.find({});
    
    for (const vault of vaults) {
        console.log(`Checking Vault: ${vault.name} (${vault.id})...`);
        
        // 1. Calculate Real User Pool from Participations
        const participations = await VaultParticipation.find({ vaultId: vault.id });
        let realUserTotal = 0;
        for (const p of participations) {
            realUserTotal += p.amountLockedUsd;
        }
        
        // 2. Compare with Vault Record
        const storedUserTotal = vault.userPoolAmount;
        const storedTotalPool = vault.totalPoolAmount;
        
        // Logic: totalPoolAmount = userPoolAmount + creatorLockedAmount (wait, no)
        // In activateVault: vault.creatorLockedAmount is separate.
        // In deposit: vault.totalPoolAmount += amountUsd; vault.userPoolAmount += amountUsd.
        // So totalPoolAmount should theoretically equal userPoolAmount initially (before trading PnL).
        // BUT if trading has started, totalPoolAmount changes. userPoolAmount stays static (Initial Capital).
        
        // SO: We can only safely repair 'userPoolAmount' based on participations.
        // 'totalPoolAmount' is dynamic. 
        // However, if the vault is in FUNDING (trading hasn't started), totalPoolAmount MUST equal userPoolAmount.
        
        if (vault.status === 'FUNDING') {
            if (Math.abs(realUserTotal - storedUserTotal) > 1) {
                console.warn(`⚠️  MISMATCH FOUND!`);
                console.warn(`   Real User Total (Participations): ${realUserTotal}`);
                console.warn(`   Stored Vault User Total: ${storedUserTotal}`);
                
                vault.userPoolAmount = realUserTotal;
                vault.totalPoolAmount = realUserTotal; // In FUNDING, these are same
                await vault.save();
                console.log(`✅ REPAIRED Vault totals.`);
            } else {
                console.log(`   OK. (Participations: ${participations.length})`);
            }
        } else {
            // ACTIVE/SETTLED
            // We can check if userPoolAmount matches.
            if (Math.abs(realUserTotal - storedUserTotal) > 1) {
                console.warn(`⚠️  MISMATCH FOUND in ACTIVE/SETTLED Vault!`);
                console.warn(`   Real Initial Capital (Participations): ${realUserTotal}`);
                console.warn(`   Stored Initial Capital: ${storedUserTotal}`);
                
                // Fixing this is trickier if trading happened, but userPoolAmount is the reference for "Initial Capital".
                // Updating it effectively corrects the "Initial Capital" record.
                // It does NOT fix totalPoolAmount (Current NAV). 
                // If the deposit failed to update totalPoolAmount but succeeded in Participation, 
                // then totalPoolAmount is missing funds too.
                // Best guess repair: Add the difference to totalPoolAmount too.
                
                const diff = realUserTotal - storedUserTotal;
                vault.userPoolAmount = realUserTotal;
                vault.totalPoolAmount += diff; // Adjust NAV by the missing deposit
                await vault.save();
                console.log(`✅ REPAIRED Vault totals (Adjusted NAV by ${diff}).`);
            } else {
                console.log(`   OK. (Participations: ${participations.length})`);
            }
        }
    }

    console.log('--- REPAIR COMPLETE ---');

  } catch (error) {
    console.error('Repair Failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

repairVaultData();
