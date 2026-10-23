import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db.js';
import { currentUser } from '../services/userService.js';
import {
  cleanName,
  newVideoId,
  ownedVideo,
  removeStoredFile,
  resolveStored,
  validateVideoSignature,
} from '../services/videoService.js';
import { ANALYZER_ID, runAnalysis } from '../services/analysisService.js';
import {
  loadVideoMedia,
  MEDIA_TOKEN_TTL_SECONDS,
  sendVideoMedia,
  signMediaToken,
} from '../services/videoMediaService.js';
import { createId, eventOut, now, publicDoc, videoOut } from '../utils/common.js';
import { fail } from '../utils/errors.js';

const allowedRisks = ['safe', 'low', 'moderate', 'high', 'critical'];
const allowedStatuses = ['queued', 'processing', 'ready', 'needs_review', 'failed'];

export async function uploadVideo(req, res) {
  const user = await currentUser(req);
  const file = req.file;
  if (!file) throw fail(422, 'A video file is required.');

  const mime = String(file.mimetype || '').toLowerCase();
  const extension = ({ 'video/mp4': '.mp4', 'video/webm': '.webm' })[mime];
  if (!extension || !validateVideoSignature(file.path, mime)) {
    fs.rmSync(file.path, { force: true });
    throw fail(415, 'Please upload a valid MP4 or WebM video.');
  }

  const rawDuration = req.body?.duration;
  const duration = rawDuration === undefined || rawDuration === '' ? null : Number(rawDuration);
  if (duration !== null && (!Number.isFinite(duration) || duration < 0 || duration > 86400)) {
    fs.rmSync(file.path, { force: true });
    throw fail(422, 'Duration must be between 0 and 86400 seconds.');
  }

  const videoId = newVideoId();
  const relativePath = `${user._id}/${videoId}${extension}`;
  const target = resolveStored(relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(file.path, target);

  const timestamp = now();
  const name = cleanName(file.originalname);
  const document = {
    _id: videoId,
    ownerId: user._id,
    name,
    nameSort: name.toLowerCase(),
    mimeType: mime,
    sizeBytes: file.size,
    storagePath: relativePath,
    durationSeconds: duration,
    status: 'queued',
    riskLevel: null,
    riskScore: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await getDb().collection('videos').insertOne(document);
  return res.status(201).json(videoOut(document));
}

export async function listVideos(req, res) {
  const user = await currentUser(req);
  const { q, risk, status, sort = 'newest' } = req.query;

  if (risk && !allowedRisks.includes(risk)) throw fail(422, 'Invalid risk filter.');
  if (status && !allowedStatuses.includes(status)) throw fail(422, 'Invalid status filter.');
  if (!['newest', 'risk', 'name'].includes(sort)) throw fail(422, 'Invalid sort order.');

  const query = { ownerId: user._id };
  if (q) {
    query.name = {
      $regex: String(q).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i',
    };
  }
  if (risk) query.riskLevel = risk;
  if (status) query.status = status;

  const order = sort === 'risk'
    ? { riskScore: -1, createdAt: -1 }
    : sort === 'name' ? { nameSort: 1 } : { createdAt: -1 };
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const videos = await getDb().collection('videos')
    .find(query)
    .sort(order)
    .skip(skip)
    .limit(limit)
    .toArray();

  return res.json(videos.map(videoOut));
}

export async function getVideo(req, res) {
  const user = await currentUser(req);
  return res.json(videoOut(await ownedVideo(req.params.videoId, user._id)));
}

export async function getVideoMediaToken(req, res) {
  const user = await currentUser(req);
  const media = await loadVideoMedia(req.params.videoId, user._id);
  const token = signMediaToken(user._id, media.videoId);
  const encodedId = encodeURIComponent(media.videoId);
  const encodedToken = encodeURIComponent(token);

  return res.json({
    token,
    expiresInSeconds: MEDIA_TOKEN_TTL_SECONDS,
    mediaPath: `/api/videos/${encodedId}/media?token=${encodedToken}`,
  });
}

export async function streamVideo(req, res, next) {
  const media = await loadVideoMedia(req.params.videoId, req.userId);
  sendVideoMedia(req, res, media, next);
}

export async function deleteVideo(req, res) {
  const user = await currentUser(req);
  const video = await ownedVideo(req.params.videoId, user._id);
  if (video.status === 'processing') {
    throw fail(409, 'Video is being analyzed. Try again when it finishes.');
  }

  const database = getDb();
  await database.collection('moderation_events').deleteMany({ videoId: video._id });
  await database.collection('moderation_results').deleteMany({ videoId: video._id });
  await database.collection('videos').deleteOne({ _id: video._id });
  removeStoredFile(video.storagePath);
  return res.status(204).end();
}

export async function analyzeVideo(req, res) {
  const user = await currentUser(req);
  const video = await ownedVideo(req.params.videoId, user._id);
  const database = getDb();
  const force = req.query.force === 'true';

  if (!force && await database.collection('moderation_events').findOne({
    videoId: video._id,
    'review.status': 'resolved',
    'review.decisionSource': 'human',
  })) {
    throw fail(409, 'This video has human review decisions. Re-analyzing would discard them; pass force=true to continue.');
  }

  const claimed = await database.collection('videos').findOneAndUpdate(
    { _id: video._id, ownerId: user._id, status: { $ne: 'processing' } },
    { $set: { status: 'processing', error: null, updatedAt: now() } },
    { returnDocument: 'after' },
  );
  if (!claimed) throw fail(409, 'This video is already being analyzed.');

  await database.collection('moderation_events').deleteMany({ videoId: video._id });
  await database.collection('moderation_results').deleteMany({ videoId: video._id });
  const resultId = createId();
  await database.collection('moderation_results').insertOne({
    _id: resultId,
    videoId: video._id,
    ownerId: user._id,
    source: 'backend',
    analyzer: ANALYZER_ID,
    status: 'processing',
    riskLevel: null,
    riskScore: null,
    chunkCount: 0,
    flaggedCount: 0,
    createdAt: now(),
    completedAt: null,
  });

  setImmediate(() => runAnalysis(video._id, resultId));
  return res.status(202).json({ jobId: resultId, videoId: video._id, status: 'processing' });
}

export async function getVideoResult(req, res) {
  const user = await currentUser(req);
  const video = await ownedVideo(req.params.videoId, user._id);
  const results = getDb().collection('moderation_results');
  const result = await results.find({ videoId: video._id }).sort({ createdAt: -1 }).limit(1).next();
  if (!result) throw fail(404, 'This video has not been analyzed yet.');

  const events = await getDb().collection('moderation_events')
    .find({ resultId: result._id })
    .sort({ startSeconds: 1 })
    .toArray();
  return res.json({ ...publicDoc(result), events: events.map(event => eventOut(event, video.name)) });
}
