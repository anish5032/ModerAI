import { Router } from 'express';
import { decideEvent } from '../controllers/reviewController.js';
import { authRequired } from '../middleware/auth.js';
import { asyncRoute } from '../utils/errors.js';

const router = Router();
router.post('/:eventId/decision', authRequired, asyncRoute(decideEvent));

export default router;
