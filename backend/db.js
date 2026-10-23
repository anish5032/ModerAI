import { MongoClient } from 'mongodb';
import { config } from './config.js';

const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
let database;

export function getDb() {
  if (!database) throw new Error('Database is not connected.');
  return database;
}

export async function connectDb() {
  await client.connect();
  database = client.db(config.mongoDb);

  await Promise.all([
    database.collection('users').createIndex({ email: 1 }, { unique: true }),
    database.collection('videos').createIndex({ ownerId: 1, createdAt: -1 }),
    database.collection('moderation_results').createIndex({ videoId: 1, createdAt: -1 }),
    database.collection('moderation_events').createIndex({ videoId: 1, startSeconds: 1 }),
    database.collection('moderation_events').createIndex({ ownerId: 1, 'review.status': 1, score: -1 }),
  ]);
}

export function closeDb() {
  return client.close();
}
