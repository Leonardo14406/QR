import express from 'express';
import {
  createBracelet,
  listBracelets,
  serveBraceletPage,
} from '../controllers/braceletController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', requireAuth, requireAdmin, createBracelet);
router.get('/', requireAuth, requireAdmin, listBracelets);

// Public route for bracelet page (no auth)
router.get('/:slug', serveBraceletPage);

export default router;
