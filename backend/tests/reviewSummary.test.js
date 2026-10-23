import assert from 'node:assert/strict';
import test from 'node:test';
import { countReviews } from '../controllers/reviewController.js';

test('review summary counts every flagged status independently of the queue filter', async () => {
  const seen = [];
  const counts = {
    pending: 4,
    resolved: 7,
    total: 11,
  };

  const events = {
    async countDocuments(query) {
      seen.push(query);

      if (query['review.status'] === 'pending') return counts.pending;
      if (query['review.status'] === 'resolved') return counts.resolved;
      return counts.total;
    },
  };

  const result = await countReviews(events, 'owner-1');

  assert.deepEqual(result, counts);
  assert.deepEqual(seen, [
    { ownerId: 'owner-1', action: { $ne: 'allow' }, 'review.status': 'pending' },
    { ownerId: 'owner-1', action: { $ne: 'allow' }, 'review.status': 'resolved' },
    { ownerId: 'owner-1', action: { $ne: 'allow' } },
  ]);
});
