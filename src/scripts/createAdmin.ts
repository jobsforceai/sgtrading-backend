import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import User from '../modules/users/user.model';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const createAdminUser = async () => {
  if (!MONGO_URI) {
    logger.error('MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    logger.info('MongoDB connected.');

    const email = 'admin@example.com';
    const password = 'admin123';
    const fullName = 'System Administrator';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      logger.info(`Admin user with email ${email} already exists.`);
      // Optional: Update password/roles if needed, or just exit
      // existingAdmin.roles = ['ADMIN', 'USER'];
      // await existingAdmin.save();
      process.exit(0);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const adminUser = new User({
      email,
      fullName,
      passwordHash,
      roles: ['ADMIN', 'USER'],
      kycStatus: 'APPROVED', // Auto-approve admin
    });

    await adminUser.save();
    logger.info(`Admin user created successfully: ${email}`);

    // Create wallet for admin (optional, but good for consistency)
    await createWalletForUser(adminUser);
    logger.info('Wallet created for admin user.');

  } catch (error) {
    logger.error({ err: error }, 'Failed to create admin user');
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed.');
    }
  }
};

createAdminUser();
