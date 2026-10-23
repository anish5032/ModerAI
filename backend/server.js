import 'dotenv/config';
import fs from 'node:fs';
import app from './app.js';
import { config } from './config.js';
import { closeDb, connectDb } from './db.js';

async function start() {
  if (config.environment.toLowerCase() === 'production') {
    if (
      config.jwtSecret.length < 32
      || /change-me|replace|dev-only/i.test(config.jwtSecret)
    ) {
      throw new Error(
        'JWT_SECRET must be a unique value of at least 32 characters when ENV=production.',
      );
    }
    if (config.mlApiKey && config.mlApiKey.length < 16) {
      throw new Error(
        'ML_API_KEY must be at least 16 characters when it is configured.',
      );
    }
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
