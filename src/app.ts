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
  // Routes
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });

  // Register
  await fastify.register(writeupRoutes, { prefix: '/api/v1/writeups' });

  await fastify.register(uploadRoutes, { prefix: '/api/v1/writeups' });

  // Error handler
  fastify.setErrorHandler(errorHandler);

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

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