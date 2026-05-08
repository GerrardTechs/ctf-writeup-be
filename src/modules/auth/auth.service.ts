import bcrypt from 'bcrypt';
import { prisma } from '../../config/database';
import { RegisterInput, LoginInput } from './auth.schema';

const SALT_ROUNDS = 12;

// Simpan track login gagal di memory (untuk production pakai Redis)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

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
  // Cek apakah email atau username sudah dipakai
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.email }, { username: input.username }],
    },
  });

  if (existing) {
    const field = existing.email === input.email ? 'Email' : 'Username';
    throw { statusCode: 409, message: `${field} sudah digunakan` };
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      passwordHash,
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return user;
}

export async function loginUser(input: LoginInput) {
  checkLoginAttempts(input.email);

  // Selalu jalankan bcrypt compare meski user tidak ada
  // supaya response time-nya sama (mencegah timing attack)
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

  // Reset login attempts kalau berhasil
  loginAttempts.delete(input.email);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}