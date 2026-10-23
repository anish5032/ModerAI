import fs from 'node:fs';
import multer from 'multer';
import { config } from '../config.js';
import { incomingUploadPath } from '../services/videoService.js';
import { createId } from '../utils/common.js';
import { fail } from '../utils/errors.js';

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const directory = incomingUploadPath();
    fs.mkdirSync(directory, { recursive: true });
    callback(null, directory);
  },
  filename: (_req, _file, callback) => callback(null, `${createId()}.upload`),
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});

export function receiveVideo(req, res, next) {
  upload.single('file')(req, res, error => {
    if (!error) return next();
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(fail(413, `Video is larger than the ${config.maxUploadMb} MB limit.`));
    }
    return next(fail(400, error.message || 'Upload failed.'));
  });
}
