import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendOtpEmail(email: string, otp: string, username: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Courier New', monospace; background: #0b111b; color: #e2e8f0; margin: 0; padding: 0; }
        .container { max-width: 480px; margin: 40px auto; background: #111827; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
        .header { background: #0f172a; padding: 24px; border-bottom: 1px solid #1e293b; }
        .logo { display: flex; align-items: center; gap: 8px; }
        .logo-icon { width: 32px; height: 32px; background: #22c55e20; border: 1px solid #22c55e40; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .logo-text { font-weight: 700; font-size: 14px; letter-spacing: 2px; color: #f8fafc; text-transform: uppercase; }
        .body { padding: 32px 24px; }
        .greeting { color: #94a3b8; font-size: 13px; margin-bottom: 16px; }
        .title { color: #f8fafc; font-size: 18px; font-weight: 700; margin-bottom: 8px; }
        .subtitle { color: #64748b; font-size: 12px; margin-bottom: 28px; }
        .otp-container { background: #0f172a; border: 1px solid #22c55e40; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px; }
        .otp-label { color: #64748b; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px; }
        .otp-code { font-size: 40px; font-weight: 900; letter-spacing: 12px; color: #22c55e; font-family: 'Courier New', monospace; }
        .otp-expiry { color: #64748b; font-size: 11px; margin-top: 12px; }
        .warning { background: #1e1a0e; border: 1px solid #92400e40; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; }
        .warning-text { color: #fbbf24; font-size: 11px; line-height: 1.6; }
        .footer { padding: 16px 24px; border-top: 1px solid #1e293b; text-align: center; }
        .footer-text { color: #334155; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <div class="logo-icon">🛡</div>
            <span class="logo-text">PwnScribe</span>
          </div>
        </div>
        <div class="body">
          <p class="greeting">Halo, ${username}!</p>
          <h1 class="title">Verifikasi Email Kamu</h1>
          <p class="subtitle">Masukkan kode OTP berikut untuk menyelesaikan pendaftaran di PwnScribe.</p>
          
          <div class="otp-container">
            <div class="otp-label">Kode Verifikasi</div>
            <div class="otp-code">${otp}</div>
            <div class="otp-expiry">⏱ Kode berlaku selama <strong style="color: #f8fafc;">10 menit</strong></div>
          </div>

          <div class="warning">
            <p class="warning-text">
              ⚠️ Jangan bagikan kode ini ke siapapun. PwnScribe tidak pernah meminta kode OTP kamu melalui chat atau telepon.
            </p>
          </div>

          <p style="color: #64748b; font-size: 11px;">
            Jika kamu tidak mendaftar di PwnScribe, abaikan email ini.
          </p>
        </div>
        <div class="footer">
          <p class="footer-text">PwnScribe — Automated CTF Write-Up Generator</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"PwnScribe" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[PwnScribe] Kode Verifikasi: ${otp}`,
    html,
  });
}

export async function sendResendOtpEmail(email: string, otp: string, username: string) {
  await sendOtpEmail(email, otp, username);
}