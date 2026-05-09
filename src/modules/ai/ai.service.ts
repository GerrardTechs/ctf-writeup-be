import Groq from 'groq-sdk';

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
  const client = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const stepsText = writeup.steps
    .map((step, index) => [
      `Step ${index + 1}:`,
      `- Deskripsi user: ${step.description}`,
      step.command ? `- Command: ${step.command}` : null,
      step.commandOutput ? `- Output: ${step.commandOutput}` : null,
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  const prompt = `Kamu adalah seorang CTF player berpengalaman yang sedang menulis writeup profesional.

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
- Balas HANYA JSON valid tanpa markdown tanpa backtick dengan format:
{"description":"string","steps":[{"orderIndex":0,"description":"string"}]}`;

  try {
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content ?? '';
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