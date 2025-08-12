// eventRoutes.js
import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as eventController from '../controllers/eventController.js';

const router = express.Router();

router.get('/', requireAuth, eventController.getAllEvents);
router.get('/:id', requireAuth, eventController.getEventById);
router.post('/', requireAuth, requireAdmin, eventController.createEvent);
router.put('/:id', requireAuth, requireAdmin, eventController.updateEvent);
router.delete('/:id', requireAuth, requireAdmin, eventController.deleteEvent);

export default router;
