import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware';
import { uploadImage, deleteImage } from './upload.service';
import { prisma } from '../../config/database';

export async function uploadRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // POST /api/v1/writeups/:id/steps/:stepId/images
  fastify.post(
    '/:id/steps/:stepId/images',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 hour' },
      },
    },
    async (req: any, reply) => {
      const { id: writeupId, stepId } = req.params;
      const userId = req.user.id;

      // Pastikan step milik writeup milik user ini
      const step = await prisma.step.findFirst({
        where: {
          id: stepId,
          writeupId,
          writeup: { userId },
        },
      });

      if (!step) {
        return reply.status(404).send({
          success: false,
          error: 'Step tidak ditemukan',
        });
      }

      // Ambil file dari multipart
      const file = await req.file();
      if (!file) {
        return reply.status(400).send({
          success: false,
          error: 'Tidak ada file yang diupload',
        });
      }

      // Baca buffer dari stream
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const result = await uploadImage(buffer, file.filename, stepId, writeupId);

      return reply.status(201).send({
        success: true,
        data: result,
      });
    }
  );

  // DELETE /api/v1/images/:imageId
  fastify.delete('/images/:imageId', async (req: any, reply) => {
    await deleteImage(req.params.imageId, req.user.id);
    return { success: true, message: 'Gambar berhasil dihapus' };
  });
}