import { prisma } from '../../config/database';
import { CreateWriteupInput, UpdateWriteupInput, CreateStepInput, UpdateStepInput } from './writeup.schema';

// ─── WRITEUP ─────────────────────────────────────────────

export async function getWriteups(userId: string) {
  return prisma.writeup.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      ctfName: true,
      category: true,
      difficulty: true,
      status: true,
      createdAt: true,
      _count: { select: { steps: true } },
    },
  });
}

export async function getWriteupById(id: string, userId: string) {
  const writeup = await prisma.writeup.findFirst({
    where: { id, userId },
    include: {
      steps: {
        orderBy: { orderIndex: 'asc' },
        include: {
          images: {
            select: {
              id: true,
              secureUrl: true,
              uploadedAt: true,
            },
          },
        },
      },
    },
  });

  if (!writeup) throw { statusCode: 404, message: 'Writeup tidak ditemukan' };
  return writeup;
}

export async function createWriteup(userId: string, input: CreateWriteupInput) {
  return prisma.writeup.create({
    data: { userId, ...input },
    select: {
      id: true,
      title: true,
      ctfName: true,
      category: true,
      difficulty: true,
      flag: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function updateWriteup(id: string, userId: string, input: UpdateWriteupInput) {
  await getWriteupById(id, userId); // ownership check

  return prisma.writeup.update({
    where: { id },
    data: input,
  });
}

export async function deleteWriteup(id: string, userId: string) {
  await getWriteupById(id, userId); // ownership check
  await prisma.writeup.delete({ where: { id } });
}

export async function publishWriteup(id: string, userId: string) {
  await getWriteupById(id, userId); // ownership check

  return prisma.writeup.update({
    where: { id },
    data: { status: 'PUBLISHED' },
    select: { id: true, status: true },
  });
}

// ─── STEPS ───────────────────────────────────────────────

export async function getSteps(writeupId: string, userId: string) {
  await getWriteupById(writeupId, userId); // ownership check

  return prisma.step.findMany({
    where: { writeupId },
    orderBy: { orderIndex: 'asc' },
    include: {
      images: {
        select: { id: true, secureUrl: true },
      },
    },
  });
}

export async function createStep(writeupId: string, userId: string, input: CreateStepInput) {
  await getWriteupById(writeupId, userId); // ownership check

  return prisma.step.create({
    data: { writeupId, ...input },
  });
}

export async function updateStep(
  writeupId: string,
  stepId: string,
  userId: string,
  input: UpdateStepInput
) {
  await getWriteupById(writeupId, userId); // ownership check

  const step = await prisma.step.findFirst({ where: { id: stepId, writeupId } });
  if (!step) throw { statusCode: 404, message: 'Step tidak ditemukan' };

  return prisma.step.update({ where: { id: stepId }, data: input });
}

export async function deleteStep(writeupId: string, stepId: string, userId: string) {
  await getWriteupById(writeupId, userId); // ownership check

  const step = await prisma.step.findFirst({ where: { id: stepId, writeupId } });
  if (!step) throw { statusCode: 404, message: 'Step tidak ditemukan' };

  await prisma.step.delete({ where: { id: stepId } });
}

export async function reorderSteps(
  writeupId: string,
  userId: string,
  steps: { stepId: string; orderIndex: number }[]
) {
  await getWriteupById(writeupId, userId); // ownership check

  // Update semua sekaligus dalam satu transaction
  await prisma.$transaction(
    steps.map(({ stepId, orderIndex }) =>
      prisma.step.update({
        where: { id: stepId },
        data: { orderIndex },
      })
    )
  );
}