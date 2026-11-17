import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from './env.ts';
import { logger } from '../utils/logger.ts';

let connectPromise: Promise<boolean> | null = null;
let memoryServer: MongoMemoryServer | null = null;
let atlasFailed = false;
let usingMemoryFallback = false;

export async function connectDatabase(): Promise<boolean> {
  if ((mongoose.connection.readyState as number) === 1) {
    return true;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    try {
      mongoose.set('strictQuery', true);

      if (
        env.mongodbUri &&
        !atlasFailed &&
        !env.mongodbUri.includes('localhost') &&
        !env.mongodbUri.includes('127.0.0.1')
      ) {
        try {
          await mongoose.connect(env.mongodbUri, {
            serverSelectionTimeoutMS: 2500,
            connectTimeoutMS: 2500,
          });
          usingMemoryFallback = false;
          logger.info({ dbName: mongoose.connection.name }, 'Connected to MongoDB Atlas');
          return true;
        } catch (atlasErr) {
          atlasFailed = true;
          const reason =
            atlasErr instanceof Error ? atlasErr.message : 'Atlas cluster unreachable';
          logger.info(
            { reason },
            'MongoDB Atlas unreachable from preview environment; falling back to embedded MongoMemoryServer.'
          );
          try {
            await mongoose.disconnect();
          } catch {}
        }
      }

      if (!memoryServer) {
        logger.info('Starting embedded MongoMemoryServer...');
        memoryServer = await MongoMemoryServer.create();
      }

      const uri = memoryServer.getUri();
      await mongoose.connect(uri);
      usingMemoryFallback = true;
      logger.info({ uri }, 'Connected to embedded MongoMemoryServer');

      try {
        const userCount = await mongoose.connection
          .collection('users')
          .countDocuments();
        if (userCount === 0) {
          logger.info('Auto-seeding embedded memory database with demo accounts & courses...');
          const { runSeed } = await import('../scripts/seed.ts');
          await runSeed({ disconnectOnComplete: false });
        }
      } catch (seedErr) {
        logger.warn({ err: seedErr }, 'Auto-seed on memory server encountered an issue');
      }

      return isDatabaseReady();
    } catch (err) {
      logger.error({ err }, 'Failed to connect to database (Atlas and Memory fallback)');
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export function isDatabaseReady(): boolean {
  return (mongoose.connection.readyState as number) === 1;
}

export function isUsingMemoryFallback(): boolean {
  return usingMemoryFallback;
}

export async function disconnectDatabase(): Promise<void> {
  if ((mongoose.connection.readyState as number) !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  usingMemoryFallback = false;
}
