import { FastifyInstance } from 'fastify';
import { RegisterSchema, LoginSchema } from './auth.schema';
import { registerUser, loginUser, verifyOtp, resendOtp } from './auth.service';
import { authRateLimit } from '../../middleware/security.middleware';


const responseSchema = {
  type: 'object',
  properties: {
  additionalProperties: true,
  },
};

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Daftar akun baru',
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
    preHandler: authRateLimit,
  }, async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validasi gagal',
        details: body.error.flatten().fieldErrors,
      });
    }
    const user = await registerUser(body.data);
    return reply.status(201).send({ success: true, data: user });
  });

  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login dan dapatkan JWT token',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
    preHandler: authRateLimit,
  }, async (request, reply) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validasi gagal',
        details: body.error.flatten().fieldErrors,
      });
    }
    const user = await loginUser(body.data);
    const token = fastify.jwt.sign(
      { id: user.id, role: user.role },
      { expiresIn: '15m' }
    );
    const refreshToken = fastify.jwt.sign(
      { id: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );
    return reply.status(200).send({
      success: true,
      data: { user, token, refreshToken, expiresIn: '15m' },
    });
  });

  // POST /api/v1/auth/verify-otp
fastify.post('/verify-otp', {
  schema: {
    tags: ['Auth'],
    summary: 'Verifikasi email dengan kode OTP',
    body: {
      type: 'object',
      required: ['email', 'otp'],
      properties: {
        email: { type: 'string', format: 'email' },
        otp: { type: 'string', minLength: 6, maxLength: 6 },
      },
    },
  },
}, async (request, reply) => {
  const { email, otp } = request.body as { email: string; otp: string };
  const result = await verifyOtp(email, otp);
  return reply.status(200).send({ success: true, data: result });
});

// POST /api/v1/auth/resend-otp
fastify.post('/resend-otp', {
  schema: {
    tags: ['Auth'],
    summary: 'Kirim ulang kode OTP',
    body: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
      },
    },
  },
}, async (request, reply) => {
  const { email } = request.body as { email: string };
  const result = await resendOtp(email);
  return reply.status(200).send({ success: true, data: result });
});

fastify.post('/login', {
  // schema sama
}, async (request, reply) => {
  const body = LoginSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      success: false,
      error: 'Validasi gagal',
      details: body.error.flatten().fieldErrors,
    });
  }

  try {
    const user = await loginUser(body.data);
    const token = fastify.jwt.sign({ id: user.id, role: user.role }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ id: user.id, type: 'refresh' }, { expiresIn: '7d' });
    return reply.status(200).send({
      success: true,
      data: { user, token, refreshToken, expiresIn: '15m' },
    });
  } catch (err: any) {
    if (err.code === 'EMAIL_NOT_VERIFIED') {
      return reply.status(403).send({
        success: false,
        error: err.message,
        code: 'EMAIL_NOT_VERIFIED',
        email: err.email,
      });
    }
    throw err;
  }
});

  fastify.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Perbarui access token menggunakan refresh token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
    preHandler: authRateLimit,
  }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (!refreshToken) {
      return reply.status(400).send({ success: false, error: 'Refresh token wajib diisi' });
    }
    try {
      const payload = fastify.jwt.verify(refreshToken) as { id: string; type: string };
      if (payload.type !== 'refresh') {
        return reply.status(401).send({ success: false, error: 'Token tidak valid' });
      }
      const user = await import('../../config/database').then(({ prisma }) =>
        prisma.user.findUnique({
          where: { id: payload.id },
          select: { id: true, role: true, username: true, email: true },
        })
      );
      if (!user) {
        return reply.status(401).send({ success: false, error: 'User tidak ditemukan' });
      }
      const newToken = fastify.jwt.sign({ id: user.id, role: user.role }, { expiresIn: '15m' });
      const newRefreshToken = fastify.jwt.sign({ id: user.id, type: 'refresh' }, { expiresIn: '7d' });
      return reply.status(200).send({
        success: true,
        data: { token: newToken, refreshToken: newRefreshToken, expiresIn: '15m' },
      });
    } catch {
      return reply.status(401).send({
        success: false,
        error: 'Refresh token expired atau tidak valid, silakan login ulang',
      });
    }
  });
}