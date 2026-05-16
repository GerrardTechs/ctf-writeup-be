import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';

// In-memory tracker untuk rate limit per IP
const requestTracker = new Map<string, { count: number; firstRequest: number; blocked?: boolean }>();
const WINDOW_MS = 15 * 60 * 1000; // 15 menit
const MAX_REQUESTS = 100;
const MAX_AUTH_REQUESTS = 10; // lebih ketat untuk auth endpoints
const AUTO_BLOCK_THRESHOLD = 200; // auto blacklist kalau > 200 req/15 menit

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0])
      .split(',')[0].trim();
  }
  return request.ip ?? '0.0.0.0';
}

async function logAudit(
  ip: string,
  action: string,
  endpoint: string,
  status: number,
  userId?: string,
  metadata?: object
) {
  try {
    await prisma.auditLog.create({
      data: { ip, action, endpoint, status, userId, metadata },
    });
  } catch { /* silent — jangan sampai audit log crash app */ }
}

export async function ipGuard(request: FastifyRequest, reply: FastifyReply) {
  const ip = getClientIp(request);
  const endpoint = request.url;
  const isAuthEndpoint = endpoint.includes('/auth/');

  // 1. Cek blacklist
  const rule = await prisma.ipRule.findUnique({ where: { ip } }).catch(() => null);

  if (rule?.type === 'blacklist') {
    // Cek apakah sudah expired
    if (rule.expiresAt && rule.expiresAt < new Date()) {
      await prisma.ipRule.delete({ where: { ip } }).catch(() => null);
    } else {
      await logAudit(ip, 'BLOCKED_BLACKLIST', endpoint, 403);
      return reply.status(403).send({
        success: false,
        error: 'Access denied',
        code: 'IP_BANNED',
      });
    }
  }

  // 2. Rate limit per IP
  const now = Date.now();
  const tracker = requestTracker.get(ip);

  if (!tracker || now - tracker.firstRequest > WINDOW_MS) {
    requestTracker.set(ip, { count: 1, firstRequest: now });
  } else {
    tracker.count++;

    const limit = isAuthEndpoint ? MAX_AUTH_REQUESTS : MAX_REQUESTS;

    // Auto blacklist kalau sangat agresif
    if (tracker.count > AUTO_BLOCK_THRESHOLD) {
      await prisma.ipRule.upsert({
        where: { ip },
        create: {
          ip,
          type: 'blacklist',
          reason: `Auto-banned: ${tracker.count} requests in 15 minutes`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 jam
        },
        update: {
          reason: `Auto-banned: ${tracker.count} requests in 15 minutes`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }).catch(() => null);

      await logAudit(ip, 'AUTO_BANNED', endpoint, 403, undefined, { count: tracker.count });

      return reply.status(403).send({
        success: false,
        error: 'Access denied',
        code: 'IP_BANNED',
      });
    }

    if (tracker.count > limit) {
      await logAudit(ip, 'RATE_LIMITED', endpoint, 429, undefined, { count: tracker.count });

      return reply.status(429).send({
        success: false,
        error: 'Terlalu banyak request. Coba lagi nanti.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((WINDOW_MS - (now - tracker.firstRequest)) / 1000),
      });
    }
  }
}

export async function authRateLimit(request: FastifyRequest, reply: FastifyReply) {
  const ip = getClientIp(request);

  // Tracker khusus auth — lebih ketat
  const key = `auth:${ip}`;
  const tracker = requestTracker.get(key);
  const now = Date.now();
  const AUTH_WINDOW = 15 * 60 * 1000;
  const AUTH_MAX = 20; // max 20 attempt login/register per 15 menit

  if (!tracker || now - tracker.firstRequest > AUTH_WINDOW) {
    requestTracker.set(key, { count: 1, firstRequest: now });
  } else {
    tracker.count++;

    if (tracker.count > AUTH_MAX) {
      // Auto blacklist IP yang brute force auth
      await prisma.ipRule.upsert({
        where: { ip },
        create: {
          ip,
          type: 'blacklist',
          reason: `Brute force detected: ${tracker.count} auth attempts`,
          expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 jam
        },
        update: {
          reason: `Brute force detected: ${tracker.count} auth attempts`,
          expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        },
      }).catch(() => null);

      await prisma.auditLog.create({
        data: {
          ip,
          action: 'BRUTE_FORCE_DETECTED',
          endpoint: request.url,
          status: 429,
          metadata: { attempts: tracker.count },
        },
      }).catch(() => null);

      return reply.status(429).send({
        success: false,
        error: 'Terlalu banyak percobaan. Akses diblokir sementara.',
        code: 'BRUTE_FORCE_BLOCKED',
      });
    }
  }
}

export { getClientIp };