import { Router } from 'express';
import { getCurrentUser, login, register } from '../controllers/authController.js';
import { authRequired } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { asyncRoute } from '../utils/errors.js';

const router = Router();
router.post('/register', authLimiter, asyncRoute(register));
router.post('/login', authLimiter, asyncRoute(login));
router.get('/me', authRequired, asyncRoute(getCurrentUser));

export default router;
