import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is not defined in environment variables');
}

// We use ioredis (TCP) because Upstash's HTTP client does not support
// blocking SUBSCRIBE / XREAD BLOCK commands needed for live streaming.
// IMPORTANT: Deploy this to the same region as your Upstash Redis instance
// and Convex deployment (e.g. us-east-1) to minimize inter-service latency.
export const redis = new Redis(redisUrl);
