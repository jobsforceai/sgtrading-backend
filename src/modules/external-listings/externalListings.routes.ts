import express from 'express';
import { getListings } from './externalListings.controller';

const router = express.Router();

// Public endpoint for external websites
// GET /api/v1/external/listings
router.get('/listings', getListings);

export default router;
