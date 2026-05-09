import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware';
import { generateWriteupPdf } from './pdf.service';
import { prisma } from '../../config/database';

export async function pdfRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/:id/pdf', {
    schema: {
      tags: ['Writeups'],
      summary: 'Download writeup sebagai PDF (server-side generated)',
    },
  }, async (req: any, reply) => {
    const userId = req.user.id;
    const writeupId = req.params.id;

    const writeup = await prisma.writeup.findFirst({
      where: { id: writeupId, userId },
      include: {
        user: { select: { username: true } },
        steps: {
          orderBy: { orderIndex: 'asc' },
          include: { images: { select: { secureUrl: true } } },
        },
      },
    });

    if (!writeup) {
      return reply.status(404).send({ success: false, error: 'Writeup tidak ditemukan' });
    }

    const pdfBuffer = await generateWriteupPdf(writeup);

    const safeFilename = writeup.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 50);

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`)
      .header('Content-Length', pdfBuffer.length)
      .send(pdfBuffer);
  });
}