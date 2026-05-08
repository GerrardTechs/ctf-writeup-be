import { sanitizeHtml } from '../../utils/sanitize';

interface Image {
  secureUrl: string;
}

interface Step {
  orderIndex: number;
  description: string;
  command?: string | null;
  commandOutput?: string | null;
  images: Image[];
}

interface WriteupData {
  title: string;
  ctfName: string;
  category: string;
  difficulty: string;
  flag?: string | null;
  description?: string | null;
  steps: Step[];
  user: { username: string };
  createdAt: Date;
}

export function generateMarkdown(writeup: WriteupData): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${writeup.title}`);
  lines.push('');
  lines.push('## Challenge Info');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **CTF** | ${writeup.ctfName} |`);
  lines.push(`| **Category** | ${writeup.category} |`);
  lines.push(`| **Difficulty** | ${writeup.difficulty} |`);
  lines.push(`| **Author** | ${writeup.user.username} |`);
  lines.push(`| **Date** | ${writeup.createdAt.toISOString().split('T')[0]} |`);
  lines.push('');

  // Description
  if (writeup.description) {
    lines.push('## Description');
    lines.push('');
    lines.push(writeup.description);
    lines.push('');
  }

  // Steps
  lines.push('## Solution');
  lines.push('');

  writeup.steps.forEach((step, index) => {
    lines.push(`### Step ${index + 1}`);
    lines.push('');
    lines.push(step.description);
    lines.push('');

    if (step.command) {
      lines.push('```bash');
      lines.push(step.command);
      lines.push('```');
      lines.push('');
    }

    if (step.commandOutput) {
      lines.push('**Output:**');
      lines.push('```');
      lines.push(step.commandOutput);
      lines.push('```');
      lines.push('');
    }

    step.images.forEach((img, imgIndex) => {
      lines.push(`![Screenshot ${index + 1}-${imgIndex + 1}](${img.secureUrl})`);
      lines.push('');
    });
  });

  // Flag
  if (writeup.flag) {
    lines.push('## Flag');
    lines.push('');
    lines.push(`\`\`\``);
    lines.push(writeup.flag);
    lines.push(`\`\`\``);
    lines.push('');
  }

  const rawMarkdown = lines.join('\n');

  // Sanitasi output sebelum dikirim
  return sanitizeHtml(rawMarkdown);
}