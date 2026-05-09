import { GoogleGenerativeAI } from '@google/generative-ai';

interface StepInput {
  orderIndex: number;
  description: string;
  command?: string | null;
  commandOutput?: string | null;
}

interface WriteupInput {
  title: string;
  ctfName: string;
  category: string;
  difficulty: string;
  flag?: string | null;
  description?: string | null;
  steps: StepInput[];
}

interface EnhancedStep {
  orderIndex: number;
  description: string;
}

interface EnhancedWriteup {
  description: string;
  steps: EnhancedStep[];
}

export async function enhanceWriteupWithAI(writeup: WriteupInput): Promise<EnhancedWriteup> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  const stepsText = writeup.steps
    .map((step, index) => [
      `Step ${index + 1}:`,
      `- Deskripsi user: ${step.description}`,
      step.command ? `- Command: ${step.command}` : null,
      step.commandOutput ? `- Output: ${step.commandOutput}` : null,
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  const prompt = `
Kamu adalah seorang CTF player berpengalaman yang sedang menulis writeup profesional.

Data challenge:
- Judul: ${writeup.title}
- CTF: ${writeup.ctfName}
- Kategori: ${writeup.category}
- Kesulitan: ${writeup.difficulty}
${writeup.flag ? `- Flag: ${writeup.flag}` : ''}

Deskripsi awal (dari user, mungkin singkat/informal):
${writeup.description ?? '(tidak ada)'}

Langkah eksploitasi:
${stepsText}

Tugas:
1. Buat deskripsi challenge yang profesional (2-3 kalimat)
2. Narasikan ulang setiap step menjadi laporan teknis yang formal, jelaskan MENGAPA langkah tersebut dilakukan

ATURAN PENTING:
- Jangan ubah command atau output teknis apapun
- Gunakan sudut pandang orang pertama ("Saya")
- Jangan tambah informasi teknis baru
- Balas HANYA JSON valid dengan format berikut:

{
  "description": "deskripsi challenge",
  "steps": [
    { "orderIndex": 0, "description": "narasi step 1" }
  ]
}
`.trim();

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText) as EnhancedWriteup;

    if (!parsed.description || !Array.isArray(parsed.steps)) {
      throw new Error('Format response tidak valid');
    }

    return parsed;
  } catch (error) {
    console.error('Enhance writeup error:', error);
    throw { statusCode: 500, message: 'AI gagal menghasilkan narasi yang valid' };
  }
}