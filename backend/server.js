import 'dotenv/config';
import fs from 'node:fs';
import app from './app.js';
import { config } from './config.js';
import { closeDb, connectDb } from './db.js';

async function start() {
  if (
    config.environment.toLowerCase() === 'production'
    && config.jwtSecret === 'dev-only-change-me-dev-only-change-me'
  ) {
    throw new Error('JWT_SECRET must be set to a unique value when ENV=production.');
  }

  await connectDb();
  fs.mkdirSync(config.storageDir, { recursive: true });
  app.listen(config.port, () => {
    console.log(`ModeraAI Node API running at http://localhost:${config.port}`);
  });
}

async function shutdown() {
  await closeDb();
  process.exit(0);
}

start().catch(error => {
  console.error('Could not start backend:', error);
  process.exit(1);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
