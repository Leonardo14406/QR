import express from 'express';
import {
  signup,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  refreshTokenHandler
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.post('/refresh-token', refreshTokenHandler);
// Password reset routes
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);

export default router;
