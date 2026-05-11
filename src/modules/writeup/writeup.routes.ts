import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware';
import {
  CreateWriteupSchema, UpdateWriteupSchema,
  CreateStepSchema, UpdateStepSchema, ReorderStepsSchema
} from './writeup.schema';
import {
  getWriteups, getWriteupById, createWriteup,
  updateWriteup, deleteWriteup, publishWriteup,
  getSteps, createStep, updateStep, deleteStep, reorderSteps
} from './writeup.service';
import { generateMarkdown } from './markdown.generator';

const bearerAuth = { security: [{ bearerAuth: [] }] };

const responseSchema = {
    type: 'object',
    additionalProperties: true,
  };

export async function writeupRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  const userId = (req: any) => req.user.id;

  // ─── WRITEUP ROUTES ──────────────────────────────────

  fastify.get('/', {
    schema: {
      ...bearerAuth,
      tags: ['Writeups'],
      summary: 'Ambil semua writeup milik user',
    },
  }, async (req) => {
    const data = await getWriteups(userId(req));
    return { success: true, data };
  });

  fastify.post('/', {
    schema: {
      ...bearerAuth,
      tags: ['Writeups'],
      summary: 'Buat writeup baru',
      body: {
        type: 'object',
        required: ['title', 'ctfName', 'category', 'difficulty'],
        properties: {
          title: { type: 'string' },
          ctfName: { type: 'string' },
          category: { type: 'string', enum: ['WEB', 'PWN', 'CRYPTO', 'FORENSICS', 'MISC', 'REV', 'OSINT'] },
          difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD', 'INSANE'] },
          flag: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const body = CreateWriteupSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Validasi gagal', details: body.error.flatten().fieldErrors });
    }
    const data = await createWriteup(userId(req), body.data);
    return reply.status(201).send({ success: true, data });
  });

  fastify.get('/:id', {
    schema: {
      ...bearerAuth,
      tags: ['Writeups'],
      summary: 'Ambil detail writeup beserta steps dan gambar',
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req: any) => {
    const data = await getWriteupById(req.params.id, userId(req));
    return { success: true, data };
  });

  fastify.patch('/:id', {
    schema: {
      ...bearerAuth,
      tags: ['Writeups'],
      summary: 'Update metadata writeup',
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req: any, reply) => {
    const body = UpdateWriteupSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Validasi gagal', details: body.error.flatten().fieldErrors });
    }
    const data = await updateWriteup(req.params.id, userId(req), body.data);
    return { success: true, data };
  });

  fastify.delete('/:id', {
    schema: {
      ...bearerAuth,
      tags: ['Writeups'],
      summary: 'Hapus writeup',
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req: any) => {
    await deleteWriteup(req.params.id, userId(req));
    return { success: true, message: 'Writeup berhasil dihapus' };
  });

  fastify.post('/:id/publish', {
    schema: {
      ...bearerAuth,
      tags: ['Writeups'],
      summary: 'Publish writeup (ubah status dari DRAFT ke PUBLISHED)',
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req: any) => {
    const data = await publishWriteup(req.params.id, userId(req));
    return { success: true, data };
  });

  fastify.get('/:id/markdown', {
    schema: {
      ...bearerAuth,
      tags: ['Writeups'],
      summary: 'Generate Markdown dari writeup',
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req: any) => {
    const writeup = await prismaGetWriteupForMarkdown(req.params.id, userId(req));
    const markdown = generateMarkdown(writeup);
    return { success: true, data: { writeupId: req.params.id, markdown } };
  });

  fastify.get('/:id/export', {
    schema: {
      ...bearerAuth,
      tags: ['Writeups'],
      summary: 'Download writeup sebagai file .md',
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req: any, reply) => {
    const writeup = await prismaGetWriteupForMarkdown(req.params.id, userId(req));
    const markdown = generateMarkdown(writeup);
  
    // Buat nama file yang aman dari judul writeup
    const safeFilename = writeup.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')   // ganti karakter aneh dengan strip
      .replace(/^-+|-+$/g, '')        // hapus strip di awal/akhir
      .substring(0, 50);              // batasi panjang nama file
  
    reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${safeFilename}.md"`)
      .send(markdown);
  });

  // Generate share link
fastify.post('/:id/share', {
  schema: {
    ...bearerAuth,
    tags: ['Writeups'],
    summary: 'Generate share link untuk writeup',
  },
}, async (req: any, reply) => {
  const { prisma } = await import('../../config/database');
  const { randomBytes } = await import('crypto');

  const writeup = await prisma.writeup.findFirst({
    where: { id: req.params.id, userId: userId(req) },
  });

  if (!writeup) {
    return reply.status(404).send({ success: false, error: 'Writeup tidak ditemukan' });
  }

  // Generate token kalau belum ada
  const shareToken = writeup.shareToken ?? randomBytes(24).toString('hex');

  await prisma.writeup.update({
    where: { id: req.params.id },
    data: { shareToken },
  });

  return reply.send({
    success: true,
    data: {
      shareToken,
      shareUrl: `${process.env.FRONTEND_URL}/share/${shareToken}`,
      message: `Saya sudah membuat writeup "${writeup.title}" menggunakan PwnScribe! Cek di sini:`,
    },
  });
});

// Revoke share link
fastify.delete('/:id/share', {
  schema: {
    ...bearerAuth,
    tags: ['Writeups'],
    summary: 'Nonaktifkan share link',
  },
}, async (req: any, reply) => {
  const { prisma } = await import('../../config/database');

  await prisma.writeup.updateMany({
    where: { id: req.params.id, userId: userId(req) },
    data: { shareToken: null },
  });

  return reply.send({ success: true, message: 'Share link dinonaktifkan' });
});
  
  // ─── STEP ROUTES ─────────────────────────────────────

  fastify.get('/:id/steps', {
    schema: {
      ...bearerAuth,
      tags: ['Steps'],
      summary: 'Ambil semua step dari sebuah writeup',
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req: any) => {
    const data = await getSteps(req.params.id, userId(req));
    return { success: true, data };
  });

  fastify.post('/:id/steps', {
    schema: {
      ...bearerAuth,
      tags: ['Steps'],
      summary: 'Tambah step baru ke writeup',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['description', 'orderIndex'],
        properties: {
          description: { type: 'string' },
          command: { type: 'string' },
          commandOutput: { type: 'string' },
          orderIndex: { type: 'number' },
        },
      },
    },
  }, async (req: any, reply) => {
    const body = CreateStepSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Validasi gagal', details: body.error.flatten().fieldErrors });
    }
    const data = await createStep(req.params.id, userId(req), body.data);
    return reply.status(201).send({ success: true, data });
  });

  fastify.put('/:id/steps/:stepId', {
    schema: {
      ...bearerAuth,
      tags: ['Steps'],
      summary: 'Update isi step',
      params: {
        type: 'object',
        properties: { id: { type: 'string' }, stepId: { type: 'string' } },
      },
    },
  }, async (req: any, reply) => {
    const body = UpdateStepSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Validasi gagal', details: body.error.flatten().fieldErrors });
    }
    const data = await updateStep(req.params.id, req.params.stepId, userId(req), body.data);
    return { success: true, data };
  });

  fastify.delete('/:id/steps/:stepId', {
    schema: {
      ...bearerAuth,
      tags: ['Steps'],
      summary: 'Hapus step dari writeup',
      params: {
        type: 'object',
        properties: { id: { type: 'string' }, stepId: { type: 'string' } },
      },
    },
  }, async (req: any) => {
    await deleteStep(req.params.id, req.params.stepId, userId(req));
    return { success: true, message: 'Step berhasil dihapus' };
  });

  fastify.patch('/:id/steps/reorder', {
    schema: {
      ...bearerAuth,
      tags: ['Steps'],
      summary: 'Reorder urutan steps',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['steps'],
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                stepId: { type: 'string' },
                orderIndex: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (req: any, reply) => {
    const body = ReorderStepsSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Validasi gagal', details: body.error.flatten().fieldErrors });
    }
    await reorderSteps(req.params.id, userId(req), body.data.steps);
    return { success: true, message: 'Step berhasil direorder' };
  });
}

async function prismaGetWriteupForMarkdown(id: string, userId: string) {
  const { prisma } = await import('../../config/database');
  const writeup = await prisma.writeup.findFirst({
    where: { id, userId },
    include: {
      user: { select: { username: true } },
      steps: {
        orderBy: { orderIndex: 'asc' },
        include: { images: { select: { secureUrl: true } } },
      },
    },
  });
  if (!writeup) throw { statusCode: 404, message: 'Writeup tidak ditemukan' };
  return writeup;
}