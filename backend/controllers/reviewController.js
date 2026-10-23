import { getDb } from '../db.js';
import { currentUser } from '../services/userService.js';
import { eventOut, now } from '../utils/common.js';
import { fail } from '../utils/errors.js';

const allowedActions = ['allow', 'flag', 'mute', 'blur', 'block'];

export async function countReviews(events, ownerId) {
  const baseQuery = { ownerId, action: { $ne: 'allow' } };
  const [pending, resolved, total] = await Promise.all([
    events.countDocuments({ ...baseQuery, 'review.status': 'pending' }),
    events.countDocuments({ ...baseQuery, 'review.status': 'resolved' }),
    events.countDocuments(baseQuery),
  ]);

  return { pending, resolved, total };
}

export async function listReviews(req, res) {
  const user = await currentUser(req);
  const status = req.query.status || 'pending';
  if (!['pending', 'resolved', 'all'].includes(status)) throw fail(422, 'Invalid review status.');

  const query = { ownerId: user._id, action: { $ne: 'allow' } };
  if (status !== 'all') query['review.status'] = status;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const events = await getDb().collection('moderation_events')
    .find(query)
    .sort({ score: -1 })
    .limit(limit)
    .toArray();

  const videoIds = [...new Set(events.map(event => event.videoId))];
  const videos = videoIds.length
    ? await getDb().collection('videos')
      .find({ _id: { $in: videoIds } }, { projection: { name: 1 } })
      .toArray()
    : [];
  const names = new Map(videos.map(video => [video._id, video.name]));
  return res.json(events.map(event => eventOut(event, names.get(event.videoId))));
}

export async function reviewSummary(req, res) {
  const user = await currentUser(req);
  const counts = await countReviews(
    getDb().collection('moderation_events'),
    user._id,
  );
  return res.json(counts);
}

export async function decideEvent(req, res) {
  const user = await currentUser(req);
  const { action, reason } = req.body || {};
  if (!allowedActions.includes(action) || (reason != null && (typeof reason !== 'string' || reason.length > 500))) {
    throw fail(422, 'Provide a valid action and an optional reason up to 500 characters.');
  }

  const timestamp = now();
  const events = getDb().collection('moderation_events');
  const event = await events.findOneAndUpdate(
    { _id: req.params.eventId, ownerId: user._id, 'review.status': { $ne: 'resolved' } },
    {
      $set: {
        reviewed: true,
        review: {
          status: 'resolved',
          reviewerId: user._id,
          decisionAction: action,
          decisionSource: 'human',
          reason: reason ?? null,
          resolvedAt: timestamp,
        },
      },
    },
    { returnDocument: 'after' },
  );

  if (!event) {
    const exists = await events.findOne(
      { _id: req.params.eventId, ownerId: user._id },
      { projection: { _id: 1 } },
    );
    if (!exists) throw fail(404, 'Event not found.');
    throw fail(409, 'This event has already been resolved.');
  }

  const pending = await events.findOne(
    { videoId: event.videoId, 'review.status': 'pending' },
    { projection: { _id: 1 } },
  );
  if (!pending) {
    await getDb().collection('videos').updateOne(
      { _id: event.videoId, status: 'needs_review' },
      { $set: { status: 'ready', updatedAt: timestamp } },
    );
  }

  return res.json(eventOut(event));
}
