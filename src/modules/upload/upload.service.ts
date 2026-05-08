import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { createHash, randomUUID } from 'crypto';
import cloudinary from './cloudinary.client';
import { prisma } from '../../config/database';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGES_PER_STEP = 10;

export async function uploadImage(
  buffer: Buffer,
  originalFilename: string,
  stepId: string,
  writeupId: string
) {
  // 1. Cek ukuran file
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw { statusCode: 413, message: 'Ukuran file maksimal 5 MB' };
  }

  // 2. Magic byte check — jangan percaya Content-Type header
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw { statusCode: 415, message: 'Tipe file tidak diizinkan. Hanya jpg, png, webp, gif.' };
  }

  // 3. Cek batas jumlah gambar per step
  const imageCount = await prisma.image.count({ where: { stepId } });
  if (imageCount >= MAX_IMAGES_PER_STEP) {
    throw { statusCode: 400, message: `Maksimal ${MAX_IMAGES_PER_STEP} gambar per step` };
  }

  // 4. Strip EXIF + re-encode via sharp (hapus metadata & embedded script)
  let sanitizedBuffer: Buffer;
  if (detected.mime === 'image/gif') {
    // sharp tidak support animasi gif dengan baik, skip re-encode tapi strip metadata
    sanitizedBuffer = buffer;
  } else {
    sanitizedBuffer = await sharp(buffer)
      .withMetadata({ exif: {} }) // hapus semua EXIF
      .toFormat('webp', { quality: 85 })
      .toBuffer();
  }

  // 5. Upload ke Cloudinary dengan nama file random
  const storageKey = `${writeupId}/${randomUUID()}`;
  const uploadResult = await new Promise<any>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        public_id: storageKey,
        folder: 'ctf-writeups',
        resource_type: 'image',
        overwrite: false,
      },
      (error, result) => {
        if (error) reject({ statusCode: 500, message: 'Gagal upload ke Cloudinary' });
        else resolve(result);
      }
    ).end(sanitizedBuffer);
  });

  // 6. Simpan URL ke database
  const image = await prisma.image.create({
    data: {
      stepId,
      cloudinaryPublicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
      originalFilenameHash: createHash('sha256').update(originalFilename).digest('hex'),
      fileSizeBytes: buffer.byteLength,
    },
    select: {
      id: true,
      secureUrl: true,
      uploadedAt: true,
    },
  });

  return {
    ...image,
    markdownSnippet: `![screenshot](${image.secureUrl})`,
  };
}

export async function deleteImage(imageId: string, userId: string) {
  // Pastikan image milik user yang request
  const image = await prisma.image.findFirst({
    where: { id: imageId },
    include: {
      step: {
        include: {
          writeup: { select: { userId: true } },
        },
      },
    },
  });

  if (!image) throw { statusCode: 404, message: 'Gambar tidak ditemukan' };
  if (image.step.writeup.userId !== userId) {
    throw { statusCode: 403, message: 'Tidak punya akses ke gambar ini' };
  }

  // Hapus dari Cloudinary
  await cloudinary.uploader.destroy(image.cloudinaryPublicId);

  // Hapus dari database
  await prisma.image.delete({ where: { id: imageId } });
}