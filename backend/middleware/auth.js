import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { verifyMediaToken } from '../services/videoMediaService.js';
import { fail } from '../utils/errors.js';

export function authRequired(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(fail(401, 'Not authenticated.'));

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') throw new Error('Invalid token');
    req.userId = payload.sub;
  } catch {
    return next(fail(401, 'Not authenticated.'));
  }

  return next();
}

export function mediaAuthRequired(req, _res, next) {
  try {
    req.userId = verifyMediaToken(req.query.token, req.params.videoId);
  } catch (error) {
    return next(error);
  }

  return next();
}
