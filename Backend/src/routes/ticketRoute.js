import express from 'express';
import {
  createTicket,
  getTickets,
  getTicketByCode,
  validateTicket,
} from '../controllers/ticketController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', requireAuth, requireAdmin, createTicket);
router.get('/', requireAuth, getTickets);
router.get('/:code', requireAuth, getTicketByCode);
router.post('/validate/:code', requireAuth, requireAdmin, validateTicket);

export default router;
