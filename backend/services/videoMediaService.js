import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { fail } from '../utils/errors.js';
import { ownedVideo, resolveStored } from './videoService.js';

const MEDIA_TOKEN_SCOPE = 'video-media';
export const MEDIA_TOKEN_TTL_SECONDS = 60 * 60;

const videoMimeTypes = new Set(['video/mp4', 'video/webm']);

export function signMediaToken(userId, videoId) {
  return jwt.sign(
    { scope: MEDIA_TOKEN_SCOPE, videoId: String(videoId) },
    config.jwtSecret,
    {
      subject: String(userId),
      expiresIn: MEDIA_TOKEN_TTL_SECONDS,
      algorithm: 'HS256',
    },
  );
}

export function verifyMediaToken(token, videoId) {
  try {
    const payload = jwt.verify(String(token || ''), config.jwtSecret, {
      algorithms: ['HS256'],
    });

    if (
      payload.scope !== MEDIA_TOKEN_SCOPE
      || String(payload.videoId) !== String(videoId)
      || typeof payload.sub !== 'string'
    ) {
      throw new Error('Invalid media token');
    }

    return payload.sub;
  } catch {
    throw fail(401, 'Media link is invalid or expired.');
  }
}

export function parseByteRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  if (!Number.isSafeInteger(size) || size < 1) return { invalid: true };

  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
  if (!match) return { invalid: true };

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { invalid: true };

  let start;
  let end;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);

    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) {
      return { invalid: true };
    }

    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);

    if (!Number.isSafeInteger(start) || start < 0 || start >= size) {
      return { invalid: true };
    }

    if (!rawEnd) {
      end = size - 1;
    } else {
      end = Number(rawEnd);

      if (!Number.isSafeInteger(end) || end < start) {
        return { invalid: true };
      }

      end = Math.min(end, size - 1);
    }
  }

  return { start, end };
}

function contentTypeFor(video, filePath) {
  if (videoMimeTypes.has(video.mimeType)) return video.mimeType;
  return path.extname(filePath).toLowerCase() === '.webm'
    ? 'video/webm'
    : 'video/mp4';
}

export async function loadVideoMedia(
  videoId,
  userId,
  {
    findOwnedVideo = ownedVideo,
    resolveVideoPath = resolveStored,
    statFile = fs.promises.stat,
  } = {},
) {
  const video = await findOwnedVideo(videoId, userId);

  if (!video?.storagePath) throw fail(404, 'Video file not found.');

  let filePath;

  try {
    filePath = resolveVideoPath(video.storagePath);
  } catch {
    throw fail(404, 'Video file not found.');
  }

  let stats;

  try {
    stats = await statFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') throw fail(404, 'Video file not found.');
    throw error;
  }

  if (!stats.isFile() || stats.size < 1) {
    throw fail(404, 'Video file not found.');
  }

  return {
    videoId: video._id ?? videoId,
    name: video.name || 'video',
    mimeType: contentTypeFor(video, filePath),
    filePath,
    size: stats.size,
  };
}

export function sendVideoMedia(req, res, media, next = () => {}) {
  const { filePath, mimeType, size, name } = media;
  const range = parseByteRange(req.headers.range, size);

  if (range?.invalid) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Range', `bytes */${size}`);
    throw fail(416, 'Requested range is not satisfiable.');
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const contentLength = end - start + 1;
  const encodedName = encodeURIComponent(name).replaceAll("'", '%27');

  res.statusCode = range ? 206 : 200;
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', contentLength);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);

  if (range) {
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath, { start, end });

  stream.once('error', error => {
    if (res.headersSent) {
      res.destroy(error);
    } else {
      next(error);
    }
  });

  stream.pipe(res);
}
