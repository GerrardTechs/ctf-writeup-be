import Anthropic from '@anthropic-ai/sdk';

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

export async function enhanceWriteupWithAI(
  writeup: WriteupInput
): Promise<EnhancedWriteup> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const stepsText = writeup.steps
    .map((step, index) => {
      return [
        `Step ${index + 1}:`,
        `- Deskripsi user: ${step.description}`,
        step.command
          ? `- Command yang dijalankan: ${step.command}`
          : null,
        step.commandOutput
          ? `- Output yang didapat: ${step.commandOutput}`
          : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const prompt = `
Kamu adalah seorang CTF player berpengalaman yang sedang menulis writeup profesional.

Data challenge:
- Judul challenge: ${writeup.title}
- CTF: ${writeup.ctfName}
- Kategori: ${writeup.category}
- Kesulitan: ${writeup.difficulty}
${writeup.flag ? `- Flag: ${writeup.flag}` : ''}

Deskripsi awal challenge:
${writeup.description ?? '(tidak ada)'}

Langkah-langkah eksploitasi:
${stepsText}

Tugas:
1. Buat deskripsi challenge yang profesional dan informatif dalam 2-3 kalimat
2. Rapikan setiap langkah eksploitasi menjadi narasi teknis yang formal namun natural
3. Jelaskan alasan atau tujuan setiap langkah dilakukan

PENTING:
- Jangan mengubah command maupun output teknis
- Tetap gunakan sudut pandang orang pertama ("Saya" / "Kami")
- Jangan menambahkan informasi teknis baru di luar input
- Jangan menambahkan flag jika tidak diberikan
- Balas HANYA dalam format JSON valid
- Jangan gunakan markdown atau backtick

Format JSON:
{
  "description": "string",
  "steps": [
    {
      "orderIndex": 0,
      "description": "string"
    }
  ]
}
`.trim();

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content
      .filter(
        (
          block
        ): block is Anthropic.TextBlock => block.type === 'text'
      )
      .map(block => block.text)
      .join('');

    const parsed = JSON.parse(responseText) as EnhancedWriteup;

    if (
      !parsed.description ||
      !Array.isArray(parsed.steps)
    ) {
      throw new Error('Format response AI tidak valid');
    }

    return parsed;
  } catch (error) {
    console.error('Enhance writeup error:', error);

    throw {
      statusCode: 500,
      message: 'AI gagal menghasilkan narasi yang valid',
    };
  }
}