import PDFDocument from 'pdfkit';
import axios from 'axios';
import { Readable } from 'stream';

interface PdfImage { secureUrl: string; }
interface PdfStep {
  orderIndex: number;
  description: string;
  command?: string | null;
  commandOutput?: string | null;
  images: PdfImage[];
}
interface WriteupPdfData {
  title: string;
  ctfName: string;
  category: string;
  difficulty: string;
  flag?: string | null;
  description?: string | null;
  steps: PdfStep[];
  user: { username: string };
  createdAt: Date;
}

const DIFF_COLOR: Record<string, string> = {
  EASY: '#22c55e',
  MEDIUM: '#fbbf24',
  HARD: '#fb923c',
  INSANE: '#f87171',
};

const CAT_ICON: Record<string, string> = {
  WEB: '[WEB]', PWN: '[PWN]', CRYPTO: '[CRYPTO]',
  FORENSICS: '[FOR]', MISC: '[MISC]', REV: '[REV]', OSINT: '[OSINT]',
};

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    return Buffer.from(response.data);
  } catch {
    return null;
  }
}

export async function generateWriteupPdf(writeup: WriteupPdfData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: writeup.title,
          Author: writeup.user.username,
          Subject: `CTF Writeup - ${writeup.ctfName}`,
          Creator: 'CTF Writeup Generator',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));

      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const W = doc.page.width;
      const ML = 50;
      const MR = 50;
      const CW = W - ML - MR;
      const diffColor = DIFF_COLOR[writeup.difficulty] ?? '#22c55e';
      const diffRgb = hexToRgb(diffColor);
      const date = new Date(writeup.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      // ── COVER PAGE ─────────────────────────────────────

      // Background
      doc.rect(0, 0, W, doc.page.height).fill('#0b111b');

      // Top accent bar
      doc.rect(0, 0, W, 4).fill(diffColor);

      // Logo + title
      doc.rect(ML, 36, 10, 10).fill(diffColor);
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fill('#94a3b8')
        .text('CTF WRITEUP GENERATOR', ML + 16, 39);

      // Date top right
      doc
        .font('Helvetica')
        .fontSize(8)
        .fill('#475569')
        .text(date, ML, 39, { width: CW, align: 'right' });

      // Category + difficulty badges
      doc.y = 90;
      const catLabel = CAT_ICON[writeup.category] ?? writeup.category;
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fill('#64748b')
        .text(`${catLabel}  ·  ${writeup.difficulty}`, ML, doc.y);

      // Main title
      doc.y += 14;
      doc
        .font('Helvetica-Bold')
        .fontSize(30)
        .fill('#f8fafc')
        .text(writeup.title, ML, doc.y, { width: CW });

      // CTF name
      doc.y += 10;
      doc
        .font('Helvetica')
        .fontSize(14)
        .fill('#64748b')
        .text(writeup.ctfName, ML, doc.y);

      // Description box
      if (writeup.description) {
        doc.y += 24;
        const descLines = doc
          .font('Helvetica')
          .fontSize(10)
          .fill('#cbd5e1');
        const descH = doc.heightOfString(writeup.description, { width: CW - 20 }) + 20;
        doc
          .rect(ML, doc.y, CW, descH)
          .fill('#1e293b');
        doc
          .rect(ML, doc.y, 3, descH)
          .fill(diffColor);
        descLines.text(writeup.description, ML + 12, doc.y + 10, { width: CW - 20 });
        doc.y += descH + 8;
      }

      // Author strip bottom of cover
      const authorY = doc.page.height - 70;
      doc
        .moveTo(ML, authorY)
        .lineTo(W - MR, authorY)
        .strokeColor('#1e293b')
        .lineWidth(0.5)
        .stroke();

      // Avatar circle
      doc
        .circle(ML + 14, authorY + 20, 14)
        .fill(diffColor);
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fill('#0b111b')
        .text(
          writeup.user.username.charAt(0).toUpperCase(),
          ML + 9,
          authorY + 14,
        );

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fill('#e2e8f0')
        .text(writeup.user.username, ML + 34, authorY + 12);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fill('#475569')
        .text('Author', ML + 34, authorY + 25);

      const stepsLabel = `${writeup.steps.length} step${writeup.steps.length > 1 ? 's' : ''}`;
      doc
        .font('Helvetica')
        .fontSize(9)
        .fill('#475569')
        .text(stepsLabel, ML, authorY + 18, { width: CW, align: 'right' });

      // ── CONTENT PAGES ──────────────────────────────────

      doc.addPage();
      doc.rect(0, 0, W, doc.page.height).fill('#111111');
      doc.rect(0, 0, W, 4).fill(diffColor);

      // Section heading
      doc.y = 40;
      doc.rect(ML, doc.y, 3, 14).fill(diffColor);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fill('#64748b')
        .text('EXPLOITATION STEPS', ML + 10, doc.y + 2);
      doc.y += 22;

      // Divider
      doc
        .moveTo(ML, doc.y)
        .lineTo(W - MR, doc.y)
        .strokeColor('#262626')
        .lineWidth(0.3)
        .stroke();
      doc.y += 10;

      // Steps
      for (let i = 0; i < writeup.steps.length; i++) {
        const step = writeup.steps[i];

        // Check if need new page
        if (doc.y > doc.page.height - 100) {
          doc.addPage();
          doc.rect(0, 0, W, doc.page.height).fill('#111111');
          doc.y = 40;
        }

        // Step header box
        doc
          .rect(ML, doc.y, CW, 22)
          .fill('#1a1a1a');

        // Step number badge
        doc
          .roundedRect(ML + 6, doc.y + 4, 14, 14, 3)
          .fill(diffColor + '33');
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fill(diffColor)
          .text(`${i + 1}`, ML + 10, doc.y + 8);

        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fill('#e2e8f0')
          .text(`Step ${i + 1}`, ML + 26, doc.y + 8);

        doc.y += 28;

        // Description
        doc
          .font('Helvetica')
          .fontSize(10)
          .fill('#cbd5e1')
          .text(step.description, ML, doc.y, { width: CW });
        doc.y += doc.heightOfString(step.description, { width: CW }) + 8;

        // Command block
        if (step.command) {
          if (doc.y > doc.page.height - 80) {
            doc.addPage();
            doc.rect(0, 0, W, doc.page.height).fill('#111111');
            doc.y = 40;
          }
          const cmdH = doc.heightOfString(step.command, {
            width: CW - 16,
            lineBreak: true,
          }) + 28;
          doc.rect(ML, doc.y, CW, cmdH).fill('#141414');
          doc.rect(ML, doc.y, CW, 16).fill('#1e1e1e');

          // Traffic lights
          doc.circle(ML + 8, doc.y + 8, 3).fill('#ff5f57');
          doc.circle(ML + 18, doc.y + 8, 3).fill('#febc2e');
          doc.circle(ML + 28, doc.y + 8, 3).fill('#28c840');
          doc
            .font('Helvetica')
            .fontSize(7)
            .fill('#6b7280')
            .text('bash', ML + 38, doc.y + 5);

          doc
            .font('Helvetica')
            .fontSize(9)
            .fill('#86efac')
            .text(step.command, ML + 8, doc.y + 20, { width: CW - 16 });
          doc.y += cmdH + 6;
        }

        // Output block
        if (step.commandOutput) {
          if (doc.y > doc.page.height - 80) {
            doc.addPage();
            doc.rect(0, 0, W, doc.page.height).fill('#111111');
            doc.y = 40;
          }
          const outH = doc.heightOfString(step.commandOutput, {
            width: CW - 16,
            lineBreak: true,
          }) + 28;
          doc.rect(ML, doc.y, CW, outH).fill('#0d0d0d');
          doc.rect(ML, doc.y, CW, 16).fill('#1a1a1a');

          doc.circle(ML + 8, doc.y + 8, 3).fill('#ff5f57');
          doc.circle(ML + 18, doc.y + 8, 3).fill('#febc2e');
          doc.circle(ML + 28, doc.y + 8, 3).fill('#28c840');
          doc
            .font('Helvetica')
            .fontSize(7)
            .fill('#6b7280')
            .text('output', ML + 38, doc.y + 5);

          doc
            .font('Helvetica')
            .fontSize(9)
            .fill('#7dd3fc')
            .text(step.commandOutput, ML + 8, doc.y + 20, { width: CW - 16 });
          doc.y += outH + 6;
        }

        // Images
        for (const img of step.images) {
          const imgBuffer = await fetchImageBuffer(img.secureUrl);
          if (imgBuffer) {
            if (doc.y > doc.page.height - 120) {
              doc.addPage();
              doc.rect(0, 0, W, doc.page.height).fill('#111111');
              doc.y = 40;
            }
            try {
              doc.image(imgBuffer, ML, doc.y, {
                width: CW,
                align: 'center',
              });
              doc.y += 8;
            } catch { /* skip corrupted images */ }
          }
        }

        doc.y += 10;

        // Step divider
        if (i < writeup.steps.length - 1) {
          doc
            .moveTo(ML + 20, doc.y)
            .lineTo(W - MR - 20, doc.y)
            .strokeColor('#262626')
            .lineWidth(0.2)
            .stroke();
          doc.y += 12;
        }
      }

      // Flag section
      if (writeup.flag) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          doc.rect(0, 0, W, doc.page.height).fill('#111111');
          doc.y = 40;
        }

        doc.y += 10;
        doc.rect(ML, doc.y, 3, 14).fill(diffColor);
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fill('#64748b')
          .text('FLAG', ML + 10, doc.y + 2);
        doc.y += 22;

        const flagH = 36;
        doc
          .rect(ML, doc.y, CW, flagH)
          .fill('#0f2a1a');
        doc
          .rect(ML, doc.y, CW, flagH)
          .strokeColor('#166534')
          .lineWidth(0.5)
          .stroke();
        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fill('#4ade80')
          .text(writeup.flag, ML + 12, doc.y + 12, { width: CW - 24 });
        doc.y += flagH + 10;
      }

      // Footer on all pages
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - 20;
        doc
          .moveTo(ML, footerY - 6)
          .lineTo(W - MR, footerY - 6)
          .strokeColor('#1e293b')
          .lineWidth(0.3)
          .stroke();
        doc
          .font('Helvetica')
          .fontSize(7)
          .fill('#334155')
          .text('CTF Writeup Generator', ML, footerY);
        doc
          .font('Helvetica')
          .fontSize(7)
          .fill('#334155')
          .text(`${writeup.title} · ${writeup.ctfName}  |  ${i + 1} / ${totalPages}`, ML, footerY, {
            width: CW,
            align: 'right',
          });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}