// Certificate of completion drawn on a canvas and saved as a PNG (no external assets).
import { sha256Hex } from '../domain/shuffle.js';

const W = 1600;
const H = 1131; // A4 landscape ratio

const TEXT = {
  vi: {
    head: 'CHỨNG NHẬN HOÀN THÀNH',
    sub: 'Sòng Nhà · Học luật chơi bài',
    certify: 'Chứng nhận',
    done: 'đã hoàn thành khoá học',
    score: (s, n) => `Điểm kiểm tra: ${s}/${n}`,
    date: (d) => `Ngày cấp: ${d}`,
    id: (x) => `Mã chứng chỉ: ${x}`,
    fun: 'Chỉ để giải trí – không dùng tiền thật',
    locale: 'vi-VN',
  },
  en: {
    head: 'CERTIFICATE OF COMPLETION',
    sub: 'Sòng Nhà · Card game school',
    certify: 'This certifies that',
    done: 'has completed the course',
    score: (s, n) => `Exam score: ${s}/${n}`,
    date: (d) => `Issued: ${d}`,
    id: (x) => `Certificate ID: ${x}`,
    fun: 'For fun only – no real money',
    locale: 'en-GB',
  },
};

/** Short, stable ID for a certificate: SHA-256 of its content, shown as XXXX-XXXX-XXXX. */
export async function certificateId({ name, course, score, total, date }) {
  const h = await sha256Hex(`song-nha-cert|${course}|${name}|${score}/${total}|${date}`);
  return h.slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}

function fitText(ctx, text, maxWidth, size, weight, family) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 16);
  return s;
}

/**
 * Draws the certificate. `accent` is a CSS colour (the player's brand colour).
 * @returns {HTMLCanvasElement}
 */
export function drawCertificate({ name, courseTitle, score, total, date, id, lang = 'vi', accent = '#b4532a' }) {
  const t = TEXT[lang] || TEXT.vi;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const serif = 'Georgia, "Times New Roman", serif';
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  // Paper
  const bg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, '#fffaf0');
  bg.addColorStop(1, '#f1e6cf');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Suit watermark
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#3a2a1a';
  ctx.font = `bold 120px ${serif}`;
  const suits = ['♠', '♥', '♦', '♣'];
  for (let y = 140, row = 0; y < H; y += 190, row++) {
    for (let x = 80 + (row % 2) * 95, k = row; x < W; x += 190, k++) ctx.fillText(suits[k % 4], x, y);
  }
  ctx.restore();

  // Borders
  ctx.strokeStyle = '#b8902e';
  ctx.lineWidth = 14;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(64, 64, W - 128, H - 128);
  // Corner suits
  ctx.fillStyle = accent;
  ctx.font = `bold 54px ${serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [['♠', 112, 112], ['♥', W - 112, 112], ['♦', 112, H - 112], ['♣', W - 112, H - 112]].forEach(([s, x, y]) => ctx.fillText(s, x, y));

  // Logo badge
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(W / 2, 190, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffaf0';
  ctx.font = `bold 64px ${serif}`;
  ctx.fillText('♠', W / 2, 194);

  ctx.fillStyle = '#2a2420';
  ctx.font = `700 64px ${serif}`;
  fitText(ctx, t.head, W - 300, 64, 700, serif);
  ctx.fillText(t.head, W / 2, 310);
  ctx.fillStyle = '#6b5a48';
  ctx.font = `500 30px ${sans}`;
  ctx.fillText(t.sub, W / 2, 372);

  ctx.font = `italic 34px ${serif}`;
  ctx.fillText(t.certify, W / 2, 468);
  ctx.fillStyle = '#1e1a17';
  fitText(ctx, name, W - 360, 92, 700, serif);
  ctx.fillText(name, W / 2, 560);
  // Underline the name
  ctx.strokeStyle = '#b8902e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 420, 625);
  ctx.lineTo(W / 2 + 420, 625);
  ctx.stroke();

  ctx.fillStyle = '#6b5a48';
  ctx.font = `italic 34px ${serif}`;
  ctx.fillText(t.done, W / 2, 690);
  ctx.fillStyle = accent;
  fitText(ctx, courseTitle, W - 360, 58, 700, sans);
  ctx.fillText(courseTitle, W / 2, 772);

  // Score / date / id
  ctx.fillStyle = '#2a2420';
  ctx.font = `600 30px ${sans}`;
  ctx.fillText(`${t.score(score, total)}   ·   ${t.date(new Date(date).toLocaleDateString(t.locale))}`, W / 2, 870);
  ctx.fillStyle = '#6b5a48';
  ctx.font = `500 26px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(t.id(id), W / 2, 922);

  // Seal
  ctx.save();
  ctx.translate(W - 260, H - 250);
  ctx.fillStyle = '#c9a227';
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.beginPath();
    ctx.moveTo(0, -92);
    ctx.lineTo(10, -76);
    ctx.lineTo(-10, -76);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffaf0';
  ctx.font = `bold 34px ${sans}`;
  ctx.fillText(`${score}/${total}`, 0, -6);
  ctx.font = `bold 22px ${sans}`;
  ctx.fillText('★ ★ ★', 0, 28);
  ctx.restore();

  ctx.fillStyle = '#8a7a68';
  ctx.font = `500 22px ${sans}`;
  ctx.fillText(t.fun, W / 2, H - 98);
  return cv;
}

export function canvasToPngBlob(cv) {
  return new Promise((resolve) => cv.toBlob((b) => resolve(b), 'image/png'));
}
