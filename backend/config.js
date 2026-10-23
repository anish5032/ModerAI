import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

function boundedNumber(raw, fallback, min, max) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const audioEventMinConfidence = boundedNumber(
  process.env.AUDIO_EVENT_MIN_CONFIDENCE,
  0.3,
  0.05,
  0.99,
);
const audioEventMaxSeconds = boundedNumber(
  process.env.AUDIO_EVENT_MAX_SECONDS,
  600,
  1,
  3600,
);

export const defaultModerationThresholds = {
  toxic: 0.72,
  severe_toxic: 0.82,
  obscene: 0.72,
  threat: 0.9,
  insult: 0.74,
  identity_hate: 0.82,
};

export const config = {
  port: Number(process.env.PORT || 5000),
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  mlApiKey: process.env.ML_API_KEY || '',
  environment: process.env.ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-dev-only-change-me',
  jwtExpireMinutes: Number(process.env.JWT_EXPIRE_MINUTES || 720),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongoDb: process.env.MONGODB_DB || 'ai_content_moderation',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  storageDir: path.resolve(directory, process.env.STORAGE_DIR || 'storage'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),
  allowRegistration: (process.env.ALLOW_REGISTRATION || 'true').toLowerCase() === 'true',
  chunkSeconds: Math.max(1, Number(process.env.CHUNK_SECONDS || 2)),
  defaultDurationSeconds: Number(process.env.DEFAULT_DURATION_SECONDS || 30),
  audioEventMinConfidence,
  audioEventMaxSeconds,
  moderationThresholds: {
    ...defaultModerationThresholds,
    ...(process.env.MODERATION_THRESHOLDS
      ? JSON.parse(process.env.MODERATION_THRESHOLDS)
      : {}),
  },
};

export const MAX_CHUNKS = 5400;
