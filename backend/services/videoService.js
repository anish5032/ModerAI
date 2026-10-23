import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { fail } from '../utils/errors.js';
import { createId } from '../utils/common.js';

export function cleanName(raw) {
  return path.basename(String(raw || 'video').replaceAll('\\', '/'))
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, 200) || 'video';
}

export function validateVideoSignature(filePath, mime) {
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(12);
  let bytesRead = 0;

  try {
    bytesRead = fs.readSync(descriptor, buffer, 0, 12, 0);
  } finally {
    fs.closeSync(descriptor);
  }

  if (mime === 'video/mp4') return bytesRead >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  if (mime === 'video/webm') {
    return bytesRead >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  return false;
}

export function resolveStored(relativePath) {
  const target = path.resolve(config.storageDir, relativePath);
  if (!target.startsWith(`${config.storageDir}${path.sep}`)) throw new Error('Invalid storage path');
  return target;
}

export async function ownedVideo(videoId, userId) {
  const video = await getDb().collection('videos').findOne({ _id: videoId, ownerId: userId });
  if (!video) throw fail(404, 'Video not found.');
  return video;
}

export function removeStoredFile(relativePath) {
  if (relativePath) fs.rmSync(resolveStored(relativePath), { force: true });
}

export function incomingUploadPath() {
  return path.join(config.storageDir, '_incoming');
}

export function newVideoId() {
  return createId();
}
