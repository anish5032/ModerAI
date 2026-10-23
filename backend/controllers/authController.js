import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { currentUser } from '../services/userService.js';
import { createId, now, userOut } from '../utils/common.js';
import { fail } from '../utils/errors.js';

const validEmail = email => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function accessToken(userId) {
  return jwt.sign({}, config.jwtSecret, {
    subject: userId,
    expiresIn: `${config.jwtExpireMinutes}m`,
    algorithm: 'HS256',
  });
}

export async function register(req, res) {
  if (!config.allowRegistration) throw fail(403, 'Registration is disabled.');
  const { name, password } = req.body || {};
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (
    !validEmail(email)
    || typeof name !== 'string'
    || !name.trim()
    || name.trim().length > 80
    || typeof password !== 'string'
    || password.length < 8
    || Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw fail(422, 'Please provide a valid email, a name (1–80 characters), and a password (8–72 bytes).');
  }

  const user = {
    _id: createId(),
    email,
    name: name.trim(),
    role: 'moderator',
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: now(),
  };

  try {
    await getDb().collection('users').insertOne(user);
  } catch (error) {
    if (error.code === 11000) throw fail(409, 'An account with this email already exists.');
    throw error;
  }

  return res.status(201).json({
    accessToken: accessToken(user._id),
    tokenType: 'bearer',
    user: userOut(user),
  });
}

export async function login(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { password } = req.body || {};
  if (!validEmail(email) || typeof password !== 'string' || !password.length) {
    throw fail(422, 'Please provide a valid email and password.');
  }

  const user = await getDb().collection('users').findOne({ email });
  const fallbackHash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxV2Yp8p1VQvR8u0Yp4K8Y0nG6K';
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash || fallbackHash);
  if (!user || !passwordMatches) throw fail(401, 'Invalid email or password.');

  return res.json({
    accessToken: accessToken(user._id),
    tokenType: 'bearer',
    user: userOut(user),
  });
}

export async function getCurrentUser(req, res) {
  return res.json(userOut(await currentUser(req)));
}
