import bcrypt from 'bcrypt';
import { prisma } from '../../config/database';
import { RegisterInput, LoginInput } from './auth.schema';
import { sanitizeText } from '../../utils/sanitize';
import { sendOtpEmail } from '../../utils/mailer';
import { randomInt } from 'crypto';

const SALT_ROUNDS = 12;

function generateOtp(): string {
  return randomInt(100000, 999999).toString();
}

// Simpan track login gagal di memory (untuk production pakai Redis)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

export async function verifyOtp(email: string, otp: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw { statusCode: 404, message: 'User tidak ditemukan' };
  }

  if (user.isVerified) {
    throw { statusCode: 400, message: 'Email sudah diverifikasi' };
  }

  if (!user.otpCode || !user.otpExpiresAt) {
    throw { statusCode: 400, message: 'OTP tidak valid. Request OTP baru.' };
  }

  if (new Date() > user.otpExpiresAt) {
    throw { statusCode: 400, message: 'OTP sudah expired. Request OTP baru.', code: 'OTP_EXPIRED' };
  }

  if (user.otpCode !== otp) {
    throw { statusCode: 400, message: 'Kode OTP salah.' };
  }

  await prisma.user.update({
    where: { email },
    data: {
      isVerified: true,
      otpCode: null,
      otpExpiresAt: null,
    },
  });

  return { message: 'Email berhasil diverifikasi! Silakan login.' };
}

export async function resendOtp(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw { statusCode: 404, message: 'User tidak ditemukan' };
  }

  if (user.isVerified) {
    throw { statusCode: 400, message: 'Email sudah diverifikasi' };
  }

  // Cooldown 1 menit sebelum bisa resend
  if (user.otpExpiresAt) {
    const timeLeft = user.otpExpiresAt.getTime() - Date.now();
    if (timeLeft > 9 * 60 * 1000) {
      throw { statusCode: 429, message: 'Tunggu 1 menit sebelum request OTP baru.' };
    }
  }

  const otp = generateOtp();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { email },
    data: { otpCode: otp, otpExpiresAt },
  });

  await sendOtpEmail(email, otp, user.username);

  return { message: 'OTP baru sudah dikirim ke email kamu.' };
}

function checkLoginAttempts(email: string) {
  const attempts = loginAttempts.get(email);
  if (!attempts) return;

  const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 menit
  const timeSinceLast = Date.now() - attempts.lastAttempt;

  if (attempts.count >= 5 && timeSinceLast < LOCKOUT_DURATION) {
    const minutesLeft = Math.ceil((LOCKOUT_DURATION - timeSinceLast) / 60000);
    throw { statusCode: 429, message: `Akun terkunci. Coba lagi dalam ${minutesLeft} menit.` };
  }

  // Reset kalau sudah lewat lockout duration
  if (timeSinceLast >= LOCKOUT_DURATION) {
    loginAttempts.delete(email);
  }
}

function recordFailedLogin(email: string) {
  const current = loginAttempts.get(email) ?? { count: 0, lastAttempt: 0 };
  loginAttempts.set(email, {
    count: current.count + 1,
    lastAttempt: Date.now(),
  });
}

export async function registerUser(input: RegisterInput) {
  const sanitized = {
    username: sanitizeText(input.username),
    email: sanitizeText(input.email).toLowerCase(),
    password: input.password,
  };

  if (sanitized.username !== input.username) {
    throw { statusCode: 400, message: 'Username mengandung karakter tidak valid' };
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: sanitized.email }, { username: sanitized.username }],
    },
  });

  if (existing) {
    await bcrypt.hash('dummy', 12);
    const field = existing.email === sanitized.email ? 'Email' : 'Username';
    throw { statusCode: 409, message: `${field} sudah digunakan` };
  }

  const passwordHash = await bcrypt.hash(sanitized.password, 12);
  const otp = generateOtp();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

  const user = await prisma.user.create({
    data: {
      username: sanitized.username,
      email: sanitized.email,
      passwordHash,
      isVerified: false,
      otpCode: otp,
      otpExpiresAt,
    },
    select: {
      id: true, username: true, email: true, role: true, createdAt: true,
    },
  });

  // Kirim OTP email
  await sendOtpEmail(sanitized.email, otp, sanitized.username);

  return user;
}

export async function loginUser(input: LoginInput) {
  checkLoginAttempts(input.email);

  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  const dummyHash = '$2b$12$dummyhashfortimingattackprevention00000000000000000000';
  const passwordMatch = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? dummyHash
  );

  if (!user || !passwordMatch) {
    recordFailedLogin(input.email);
    throw { statusCode: 401, message: 'Email atau password salah' };
  }

  // Cek verifikasi email
  if (!user.isVerified) {
    throw {
      statusCode: 403,
      message: 'Email belum diverifikasi. Cek inbox kamu.',
      code: 'EMAIL_NOT_VERIFIED',
      email: user.email,
    };
  }

  loginAttempts.delete(input.email);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}