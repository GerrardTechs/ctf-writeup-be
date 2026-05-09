import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware';
import { enhanceWriteupWithAI } from './ai.service';
import { prisma } from '../../config/database';

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // POST /api/v1/writeups/:id/enhance
  fastify.post('/:id/enhance', {
    schema: {
      tags: ['Writeups'],
      summary: 'Enhance narasi writeup menggunakan AI',
    },
    config: {
      rateLimit: { max: 10, timeWindow: '1 hour' },
    },
  }, async (req: any, reply) => {
    const userId = req.user.id;
    const writeupId = req.params.id;

    const writeup = await prisma.writeup.findFirst({
      where: { id: writeupId, userId },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            orderIndex: true,
            description: true,
            command: true,
            commandOutput: true,
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

    return reply.status(200).send({
      success: true,
      data: enhanced,
    });
  });

  // POST /api/v1/writeups/:id/enhance/apply
  // Apply hasil enhance langsung ke database
  fastify.post('/:id/enhance/apply', {
    schema: {
      tags: ['Writeups'],
      summary: 'Apply hasil AI enhancement ke writeup',
    },
  }, async (req: any, reply) => {
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

    // Update description writeup
    await prisma.writeup.update({
      where: { id: writeupId },
      data: { description },
    });

    // Update setiap step
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