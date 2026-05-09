import PDFDocument from 'pdfkit';
import axios from 'axios';
import sharp from 'sharp';

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

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return await sharp(Buffer.from(response.data)).jpeg({ quality: 85 }).toBuffer();
  } catch (err) {
    console.error('Failed to fetch image:', url, err);
    return null;
  }
}

export async function generateWriteupPdf(writeup: WriteupPdfData): Promise<Buffer> {
  // Pre-fetch all images first
  const stepImages: (Buffer | null)[][] = [];
  for (const step of writeup.steps) {
    const imgs: (Buffer | null)[] = [];
    for (const img of step.images) {
      imgs.push(await fetchImage(img.secureUrl));
    }
    stepImages.push(imgs);
  }

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        bufferPages: true,
        info: {
          Title: writeup.title,
          Author: writeup.user.username,
          Creator: 'CTF Writeup Generator',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW = doc.page.width;   // 595
      const PH = doc.page.height;  // 842
      const ML = 50;
      const MR = 50;
      const CW = PW - ML - MR;
      const diffColor = DIFF_COLOR[writeup.difficulty] ?? '#22c55e';
      const diffRgb = hexToRgb(diffColor);
      const date = new Date(writeup.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      // ── COVER PAGE ─────────────────────────────────────

      // Background
      doc.rect(0, 0, PW, PH).fill('#0b111b');

      // Top accent bar
      doc.rect(0, 0, PW, 5).fill(diffColor);

      // Logo
      doc.rect(ML, 40, 10, 10).fill(diffColor);
      doc.font('Helvetica-Bold').fontSize(8).fill('#94a3b8')
        .text('CTF WRITEUP GENERATOR', ML + 16, 44, { lineBreak: false });

      // Date
      doc.font('Helvetica').fontSize(8).fill('#475569')
        .text(date, 0, 44, { width: PW - MR, align: 'right', lineBreak: false });

      // Badges
      doc.font('Helvetica-Bold').fontSize(8).fill(diffColor)
        .text(`[${writeup.category}]  ·  ${writeup.difficulty}`, ML, 80);

      // Title
      doc.font('Helvetica-Bold').fontSize(32).fill('#f8fafc')
        .text(writeup.title, ML, 100, { width: CW });

      // CTF name
      const titleHeight = doc.heightOfString(writeup.title, {
        width: CW, fontSize: 32,
      });
      doc.font('Helvetica').fontSize(14).fill('#64748b')
        .text(writeup.ctfName, ML, 108 + titleHeight, { width: CW });

      // Description box
      if (writeup.description) {
        const descY = 130 + titleHeight;
        const descH = doc.heightOfString(writeup.description, {
          width: CW - 20, fontSize: 10,
        }) + 24;
        doc.rect(ML, descY, CW, descH).fill('#1e293b');
        doc.rect(ML, descY, 3, descH).fill(diffColor);
        doc.font('Helvetica').fontSize(10).fill('#cbd5e1')
          .text(writeup.description, ML + 12, descY + 12, { width: CW - 20 });
      }

      // Author strip — fixed at bottom of cover
      const authorY = PH - 80;
      doc.moveTo(ML, authorY).lineTo(PW - MR, authorY)
        .strokeColor('#1e293b').lineWidth(0.5).stroke();

      doc.circle(ML + 14, authorY + 22, 14).fill(diffColor);
      doc.font('Helvetica-Bold').fontSize(12).fill('#0b111b')
        .text(writeup.user.username.charAt(0).toUpperCase(), ML + 8, authorY + 16, { lineBreak: false });

      doc.font('Helvetica-Bold').fontSize(11).fill('#e2e8f0')
        .text(writeup.user.username, ML + 34, authorY + 14, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fill('#475569')
        .text('Author', ML + 34, authorY + 27, { lineBreak: false });

      const stepsLabel = `${writeup.steps.length} step${writeup.steps.length > 1 ? 's' : ''}`;
      doc.font('Helvetica').fontSize(9).fill('#475569')
        .text(stepsLabel, 0, authorY + 20, { width: PW - MR, align: 'right', lineBreak: false });

      // ── CONTENT PAGES ──────────────────────────────────

      doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      doc.rect(0, 0, PW, PH).fill('#111111');
      doc.rect(0, 0, PW, 5).fill(diffColor);

      let y = 40;

      const newPage = () => {
        doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        doc.rect(0, 0, PW, PH).fill('#111111');
        doc.rect(0, 0, PW, 5).fill(diffColor);
        y = 40;
      };

      const checkPage = (needed: number) => {
        if (y + needed > PH - 50) newPage();
      };

      // Section heading
      doc.rect(ML, y, 3, 16).fill(diffColor);
      doc.font('Helvetica-Bold').fontSize(9).fill('#64748b')
        .text('EXPLOITATION STEPS', ML + 10, y + 4, { lineBreak: false });
      y += 24;

      doc.moveTo(ML, y).lineTo(PW - MR, y)
        .strokeColor('#262626').lineWidth(0.3).stroke();
      y += 14;

      // Steps
      for (let i = 0; i < writeup.steps.length; i++) {
        const step = writeup.steps[i];
        checkPage(40);

        // Step header
        doc.rect(ML, y, CW, 24).fill('#1a1a1a');
        doc.roundedRect(ML + 6, y + 5, 14, 14, 3)
          .fill(diffColor + '33');
        doc.font('Helvetica-Bold').fontSize(8).fill(diffColor)
          .text(`${i + 1}`, ML + 11, y + 9, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(10).fill('#e2e8f0')
          .text(`Step ${i + 1}`, ML + 26, y + 9, { lineBreak: false });
        y += 30;

        // Description
        checkPage(20);
        const descH = doc.heightOfString(step.description, { width: CW, fontSize: 10 });
        doc.font('Helvetica').fontSize(10).fill('#cbd5e1')
          .text(step.description, ML, y, { width: CW });
        y += descH + 10;

        // Command block
        if (step.command) {
          const cmdH = doc.heightOfString(step.command, { width: CW - 20, fontSize: 9 }) + 32;
          checkPage(cmdH + 10);
          doc.rect(ML, y, CW, cmdH).fill('#141414');
          doc.rect(ML, y, CW, 18).fill('#1e1e1e');
          doc.circle(ML + 8, y + 9, 3).fill('#ff5f57');
          doc.circle(ML + 18, y + 9, 3).fill('#febc2e');
          doc.circle(ML + 28, y + 9, 3).fill('#28c840');
          doc.font('Helvetica').fontSize(7).fill('#6b7280')
            .text('bash', ML + 38, y + 6, { lineBreak: false });
          doc.font('Helvetica').fontSize(9).fill('#86efac')
            .text(step.command, ML + 10, y + 22, { width: CW - 20 });
          y += cmdH + 8;
        }

        // Output block
        if (step.commandOutput) {
          const outH = doc.heightOfString(step.commandOutput, { width: CW - 20, fontSize: 9 }) + 32;
          checkPage(outH + 10);
          doc.rect(ML, y, CW, outH).fill('#0d0d0d');
          doc.rect(ML, y, CW, 18).fill('#1a1a1a');
          doc.circle(ML + 8, y + 9, 3).fill('#ff5f57');
          doc.circle(ML + 18, y + 9, 3).fill('#febc2e');
          doc.circle(ML + 28, y + 9, 3).fill('#28c840');
          doc.font('Helvetica').fontSize(7).fill('#6b7280')
            .text('output', ML + 38, y + 6, { lineBreak: false });
          doc.font('Helvetica').fontSize(9).fill('#7dd3fc')
            .text(step.commandOutput, ML + 10, y + 22, { width: CW - 20 });
          y += outH + 8;
        }

        // Images
        const imgs = stepImages[i];
        for (const imgBuf of imgs) {
          if (!imgBuf) continue;
          try {
            const meta = await sharp(imgBuf).metadata();
            const ratio = (meta.height ?? 200) / (meta.width ?? 300);
            const imgW = CW;
            const imgH = Math.min(imgW * ratio, 220);
            checkPage(imgH + 16);
            doc.rect(ML, y, imgW, imgH).strokeColor('#262626').lineWidth(0.5).stroke();
            doc.image(imgBuf, ML, y, { width: imgW, height: imgH });
            y += imgH + 12;
          } catch (e) {
            console.error('Failed to render image to PDF:', e);
          }
        }

        y += 8;

        // Step divider
        if (i < writeup.steps.length - 1) {
          checkPage(20);
          doc.moveTo(ML + 20, y).lineTo(PW - MR - 20, y)
            .strokeColor('#262626').lineWidth(0.2).stroke();
          y += 16;
        }
      }

      // Flag
      if (writeup.flag) {
        checkPage(60);
        y += 12;
        doc.rect(ML, y, 3, 16).fill(diffColor);
        doc.font('Helvetica-Bold').fontSize(9).fill('#64748b')
          .text('FLAG', ML + 10, y + 4, { lineBreak: false });
        y += 24;

        const flagH = 40;
        doc.rect(ML, y, CW, flagH).fill('#0f2a1a');
        doc.moveTo(ML, y).lineTo(PW - MR, y)
          .strokeColor('#166534').lineWidth(0.5).stroke();
        doc.moveTo(ML, y + flagH).lineTo(PW - MR, y + flagH)
          .strokeColor('#166534').lineWidth(0.5).stroke();
        doc.font('Helvetica-Bold').fontSize(14).fill('#4ade80')
          .text(writeup.flag, ML + 12, y + 13, { width: CW - 24, lineBreak: false });
        y += flagH + 12;
      }

      // Footer on all pages
      doc.flushPages();
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const fy = PH - 22;
        doc.moveTo(ML, fy - 6).lineTo(PW - MR, fy - 6)
          .strokeColor('#1e293b').lineWidth(0.3).stroke();
        doc.font('Helvetica').fontSize(7).fill('#334155')
          .text('CTF Writeup Generator', ML, fy, { lineBreak: false });
        doc.font('Helvetica').fontSize(7).fill('#334155')
          .text(`${writeup.title} · ${writeup.ctfName}  |  ${i + 1} / ${range.count}`,
            0, fy, { width: PW - MR, align: 'right', lineBreak: false });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}