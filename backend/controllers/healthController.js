import { getDb } from '../db.js';

export async function getHealth(_req, res) {
  try {
    await getDb().command({ ping: 1 });
    return res.json({ status: 'ok', database: 'up' });
  } catch {
    return res.status(503).json({ status: 'degraded', database: 'down' });
  }
}
