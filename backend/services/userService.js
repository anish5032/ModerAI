import { getDb } from '../db.js';
import { fail } from '../utils/errors.js';

export async function currentUser(req) {
  const user = await getDb().collection('users').findOne({ _id: req.userId });
  if (!user) throw fail(401, 'Not authenticated.');
  return user;
}
