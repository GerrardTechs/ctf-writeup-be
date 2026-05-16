import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { errorHandler } from './middleware/error.handler';
import { authRoutes } from './modules/auth/auth.routes';
import { writeupRoutes } from './modules/writeup/writeup.routes';
import { uploadRoutes } from './modules/upload/upload.routes';
import { pdfRoutes } from './modules/pdf/pdf.routes';
import { aiRoutes } from './modules/ai/ai.routes';
import { ipGuard } from './middleware/security.middleware';


const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
    ajv: {
      customOptions: {
        removeAdditional: false,
        useDefaults: true,
        coerceTypes: true,
      },
    },
  });

async function buildApp() {
  // Security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'res.cloudinary.com'],
        scriptSrc: ["'self'"],
      },
    },
  });

  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'CTF Writeup Generator API',
        description: 'Backend API untuk mengotomatiskan pembuatan laporan writeup CTF dalam format Markdown.',
        version: '1.0.0',
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development server' },
      ],
      tags: [
        { name: 'Auth', description: 'Autentikasi dan manajemen token' },
        { name: 'Writeups', description: 'Manajemen writeup CTF' },
        { name: 'Steps', description: 'Manajemen langkah eksploitasi' },
        { name: 'Images', description: 'Upload dan manajemen gambar' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });
  
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
  });

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        origin === 'http://localhost:5173' ||
        origin.endsWith('.vercel.app')
      ) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Terlalu banyak request, coba lagi nanti',
    }),
  });

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET!,
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB
      files: 1,
    },
  });

  fastify.addHook('onRequest', ipGuard);

  // Routes
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });

  fastify.get('/api/v1/ai/credits', async (req: any, reply) => {
    // Sudah dihandle di aiRoutes tapi butuh auth
    // Buat handler langsung di sini
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  
    const { prisma } = await import('./config/database');
    const user = await prisma.user.findUnique({
      where: { id: (req.user as any).id },
      select: { aiCredits: true, plan: true },
    });
  
    return { success: true, data: { credits: user?.aiCredits ?? 0, plan: user?.plan ?? 'FREE' } };
  });

  // Public route — tidak perlu auth
fastify.get('/api/v1/public/writeup/:token', async (req: any, reply) => {
  const { prisma } = await import('./config/database');
  const { decryptFlag } = await import('./utils/encryption');

  const writeup = await prisma.writeup.findFirst({
    where: { shareToken: req.params.token },
    include: {
      user: { select: { username: true } },
      steps: {
        orderBy: { orderIndex: 'asc' },
        include: { images: { select: { id: true, secureUrl: true } } },
      },
    },
  });

  if (!writeup) {
    return reply.status(404).send({ success: false, error: 'Link tidak valid atau sudah dinonaktifkan' });
  }

  return reply.send({
    success: true,
    data: {
      ...writeup,
      flag: writeup.flag ? decryptFlag(writeup.flag) : null,
      shareToken: undefined, // jangan expose token
    },
  });
});

  // Register
  await fastify.register(writeupRoutes, { prefix: '/api/v1/writeups' });
  await fastify.register(pdfRoutes, { prefix: '/api/v1/writeups' });
  await fastify.register(aiRoutes, { prefix: '/api/v1/writeups' });
  await fastify.register(uploadRoutes, { prefix: '/api/v1/writeups' });

  // Error handler
  fastify.setErrorHandler(errorHandler);

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  
// Admin only — manage IP blacklist
fastify.post('/api/v1/admin/blacklist', async (req: any, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }

  const { prisma } = await import('./config/database');
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { role: true },
  });

  if (user?.role !== 'ADMIN') {
    return reply.status(403).send({ success: false, error: 'Forbidden' });
  }

  const { ip, reason, hours } = req.body as { ip: string; reason: string; hours?: number };

  await prisma.ipRule.upsert({
    where: { ip },
    create: {
      ip, type: 'blacklist', reason,
      expiresAt: hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : undefined,
    },
    update: {
      reason,
      expiresAt: hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : undefined,
    },
  });

  return reply.send({ success: true, message: `IP ${ip} di-blacklist` });
});

fastify.delete('/api/v1/admin/blacklist/:ip', async (req: any, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }

  const { prisma } = await import('./config/database');
  await prisma.ipRule.deleteMany({ where: { ip: req.params.ip } });

  return reply.send({ success: true, message: `IP ${req.params.ip} di-unban` });
});

// Lihat audit log — admin only
fastify.get('/api/v1/admin/audit-logs', async (req: any, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }

  const { prisma } = await import('./config/database');
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return reply.send({ success: true, data: logs });
});
   return fastify;
}



async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
    console.log('Server running at http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}



main();