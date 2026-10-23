import { Router } from 'express';
import {
  analyzeVideo,
  deleteVideo,
  getVideo,
  getVideoMediaToken,
  getVideoResult,
  listVideos,
  streamVideo,
  uploadVideo,
} from '../controllers/videoController.js';
import { authRequired, mediaAuthRequired } from '../middleware/auth.js';
import { receiveVideo } from '../middleware/upload.js';
import { asyncRoute } from '../utils/errors.js';

const router = Router();
router.post('/', authRequired, receiveVideo, asyncRoute(uploadVideo));
router.get('/', authRequired, asyncRoute(listVideos));
router.get('/:videoId', authRequired, asyncRoute(getVideo));
router.get('/:videoId/media-token', authRequired, asyncRoute(getVideoMediaToken));
router.get('/:videoId/media', mediaAuthRequired, asyncRoute(streamVideo));
router.delete('/:videoId', authRequired, asyncRoute(deleteVideo));
router.post('/:videoId/analyze', authRequired, asyncRoute(analyzeVideo));
router.get('/:videoId/result', authRequired, asyncRoute(getVideoResult));

export default router;
