import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  const stepsText = writeup.steps
    .map((s, i) => `
Step ${i + 1}:
- Deskripsi user: ${s.description}
${s.command ? `- Command yang dijalankan: ${s.command}` : ''}
${s.commandOutput ? `- Output yang didapat: ${s.commandOutput}` : ''}
    `.trim())
    .join('\n\n');

  const prompt = `Kamu adalah seorang CTF player berpengalaman yang sedang menulis writeup profesional.

Data writeup yang perlu dinaasikan:
- Judul challenge: ${writeup.title}
- CTF: ${writeup.ctfName}
- Kategori: ${writeup.category}
- Kesulitan: ${writeup.difficulty}
${writeup.flag ? `- Flag: ${writeup.flag}` : ''}

Deskripsi awal challenge (dari user, mungkin singkat/informal):
${writeup.description ?? '(tidak ada)'}

Langkah-langkah eksploitasi:
${stepsText}

Tugasmu:
1. Buat deskripsi challenge yang profesional dan informatif (2-3 kalimat, jelaskan apa yang dichallengekan)
2. Narasikan ulang setiap step menjadi penjelasan yang rapi seperti laporan teknis — gunakan bahasa Indonesia yang formal tapi tetap natural. Sertakan konteks kenapa langkah tersebut dilakukan, bukan hanya apa yang dilakukan.

PENTING:
- Jangan ubah command atau output teknis apapun
- Tetap gunakan kata ganti orang pertama ("Saya", "Kami")  
- Jangan tambahkan informasi teknis yang tidak ada di input
- Jangan tambahkan flag jika tidak diberikan

Balas HANYA dengan JSON valid tanpa markdown, tanpa backtick, dengan format:
{
  "description": "deskripsi challenge yang sudah dinaasikan",
  "steps": [
    {
      "orderIndex": 0,
      "description": "narasi step 1 yang sudah diperbaiki"
    }
  ]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content
    .filter(block => block.type === 'text')
    .map(block => (block as any).text)
    .join('');

  try {
    const parsed = JSON.parse(responseText) as EnhancedWriteup;
    return parsed;
  } catch {
    throw { statusCode: 500, message: 'AI gagal menghasilkan narasi yang valid' };
  }
}