import { Router } from 'express';
import { getHealth } from '../controllers/healthController.js';
import { asyncRoute } from '../utils/errors.js';

const router = Router();
router.get('/', asyncRoute(getHealth));

export default router;
