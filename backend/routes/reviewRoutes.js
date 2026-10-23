import { Router } from 'express';
import { listReviews, reviewSummary } from '../controllers/reviewController.js';
import { authRequired } from '../middleware/auth.js';
import { asyncRoute } from '../utils/errors.js';

const router = Router();
router.get('/', authRequired, asyncRoute(listReviews));
router.get('/summary', authRequired, asyncRoute(reviewSummary));

export default router;
