import express from 'express';
import authRoutes from './auth/auth.routes';
import userRoutes from './users/user.routes';
import walletRoutes from './wallets/wallet.routes';
import marketRoutes from './market/market.routes';
import tradingRoutes from './trading/trading.routes';
import sgcOnrampRoutes from './sgc-onramp/sgcOnramp.routes';
import adminRoutes from './admin/admin.routes';
import botRoutes from './bots/bot.routes';
import vaultRoutes from './vaults/vault.routes';
import externalListingsRoutes from './external-listings/externalListings.routes';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/wallets', walletRoutes);
router.use('/markets', marketRoutes);
router.use('/trades', tradingRoutes);
router.use('/sgc-onramp', sgcOnrampRoutes);
router.use('/admin', adminRoutes);
router.use('/bots', botRoutes);
router.use('/vaults', vaultRoutes);
router.use('/external', externalListingsRoutes);

export default router;
