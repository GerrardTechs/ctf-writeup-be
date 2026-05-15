import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware';
import { enhanceWriteupWithAI } from './ai.service';
import { prisma } from '../../config/database';

// 1. Ubah helper function untuk mengambil titik awal hari ini (jam 00:00)
function getDayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // GET /api/v1/ai/credits — cek sisa credit
  fastify.get('/credits', async (req: any) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { aiCredits: true, plan: true, creditResetAt: true },
    });

    if (!user) return { success: true, data: { credits: 0, plan: 'FREE' } };

    // 2. Gunakan getDayStart untuk mengecek apakah sudah ganti hari
    const dayStart = getDayStart();
    if (!user.creditResetAt || user.creditResetAt < dayStart) {
      const resetCredits = user.plan === 'PRO' ? 999 : 8; // Set limit harian di sini
      await prisma.user.update({
        where: { id: req.user.id },
        data: { aiCredits: resetCredits, creditResetAt: new Date() },
      });
      return {
        success: true,
        data: { credits: resetCredits, plan: user.plan },
      };
    }

    return {
      success: true,
      data: { credits: user.aiCredits, plan: user.plan },
    };
  });

  // POST /api/v1/writeups/:id/enhance
  fastify.post('/:id/enhance', {
    schema: {
      tags: ['Writeups'],
      summary: 'Enhance narasi writeup menggunakan AI',
    },
  }, async (req: any, reply) => {
    const userId = req.user.id;
    const writeupId = req.params.id;

    // Cek dan deduct credit
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { aiCredits: true, plan: true, creditResetAt: true },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User tidak ditemukan' });
    }

    // 3. Terapkan logika ganti hari sebelum eksekusi AI
    const dayStart = getDayStart();
    let currentCredits = user.aiCredits;
    
    if (!user.creditResetAt || user.creditResetAt < dayStart) {
      currentCredits = user.plan === 'PRO' ? 999 : 8;
      await prisma.user.update({
        where: { id: userId },
        data: { aiCredits: currentCredits, creditResetAt: new Date() },
      });
    }

    // Cek credit — PRO tidak terbatas
    if (user.plan !== 'PRO' && currentCredits <= 0) {
      return reply.status(402).send({
        success: false,
        // 4. Update error message agar informatif
        error: 'Credit AI habis. Silakan tunggu besok atau upgrade ke Pro untuk enhance unlimited.',
        code: 'INSUFFICIENT_CREDITS',
      });
    }

    const writeup = await prisma.writeup.findFirst({
      where: { id: writeupId, userId },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true, orderIndex: true,
            description: true, command: true, commandOutput: true,
          },
        },
      },
    });

    if (!writeup) {
      return reply.status(404).send({ success: false, error: 'Writeup tidak ditemukan' });
    }

    if (writeup.steps.length === 0) {
      return reply.status(400).send({ success: false, error: 'Writeup harus punya minimal 1 step' });
    }

    const enhanced = await enhanceWriteupWithAI(writeup);

    // Kurangi credit setelah berhasil
    if (user.plan !== 'PRO') {
      await prisma.user.update({
        where: { id: userId },
        data: { aiCredits: { decrement: 1 } },
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        ...enhanced,
        creditsRemaining: user.plan === 'PRO' ? 'unlimited' : currentCredits - 1,
      },
    });
  });

  // POST /api/v1/writeups/:id/enhance/apply
  // (Bagian ini tidak saya ubah karena tidak berkaitan dengan logika credit)
  fastify.post('/:id/enhance/apply', async (req: any, reply) => {
    const userId = req.user.id;
    const writeupId = req.params.id;
    const { description, steps } = req.body as {
      description: string;
      steps: { orderIndex: number; description: string }[];
    };

    const writeup = await prisma.writeup.findFirst({
      where: { id: writeupId, userId },
      include: { steps: true },
    });

    if (!writeup) {
      return reply.status(404).send({ success: false, error: 'Writeup tidak ditemukan' });
    }

    await prisma.writeup.update({
      where: { id: writeupId },
      data: { description },
    });

    for (const enhancedStep of steps) {
      const step = writeup.steps.find(s => s.orderIndex === enhancedStep.orderIndex);
      if (step) {
        await prisma.step.update({
          where: { id: step.id },
          data: { description: enhancedStep.description },
        });
      }
    }

    return reply.status(200).send({
      success: true,
      message: 'Narasi berhasil diupdate',
    });
  });
}