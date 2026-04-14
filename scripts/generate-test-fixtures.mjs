import { writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'tests', 'fixtures');

// Build a minimal valid PDF with correct xref byte offsets
function buildPdf(textLines) {
  const objects = [];
  const offsets = [];

  // We'll accumulate raw bytes and track positions
  let header = '%PDF-1.4\n';

  // Object 1: Catalog
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  // Object 2: Pages
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  // Object 3: Page
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';

  // Object 4: Content stream
  let streamContent = 'BT\n';
  let y = 700;
  for (const line of textLines) {
    streamContent += `/F1 14 Tf\n100 ${y} Td\n(${line}) Tj\n`;
    y -= 30;
  }
  streamContent += 'ET\n';
  const obj4 = `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`;

  // Object 5: Font
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const body = header + obj1 + obj2 + obj3 + obj4 + obj5;
  const bodyBuf = Buffer.from(body, 'binary');

  // Calculate offsets
  const headerLen = Buffer.byteLength(header, 'binary');
  const off1 = headerLen;
  const off2 = off1 + Buffer.byteLength(obj1, 'binary');
  const off3 = off2 + Buffer.byteLength(obj2, 'binary');
  const off4 = off3 + Buffer.byteLength(obj3, 'binary');
  const off5 = off4 + Buffer.byteLength(obj4, 'binary');

  const pad = (n) => String(n).padStart(10, '0');

  const e = '\r\n';
  const xref = `xref\n0 6\n${pad(0)} 65535 f ${e}${pad(off1)} 00000 n ${e}${pad(off2)} 00000 n ${e}${pad(off3)} 00000 n ${e}${pad(off4)} 00000 n ${e}${pad(off5)} 00000 n ${e}`;
  const startxref = bodyBuf.length;
  const trailer = `${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.concat([bodyBuf, Buffer.from(trailer, 'binary')]);
}

// 1. Valid PDF with known text
const modelCardPdf = buildPdf([
  'Claude Sonnet 4 Model Card',
  'Provider: Anthropic',
  'Parameters: 175 billion',
  'Context Window: 200000 tokens',
]);
writeFileSync(join(fixturesDir, 'sample-model-card.pdf'), modelCardPdf);
console.log(`Created sample-model-card.pdf (${modelCardPdf.length} bytes)`);

// 2. Non-PDF file
writeFileSync(join(fixturesDir, 'not-a-pdf.pdf'), 'This is just a plain text file, not a real PDF.');
console.log('Created not-a-pdf.pdf');

// 3. Valid PDF with empty content stream (no text)
function buildEmptyPdf() {
  let header = '%PDF-1.4\n';
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const streamContent = '';
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n   /Contents 4 0 R /Resources << >> >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`;

  const body = header + obj1 + obj2 + obj3 + obj4;
  const bodyBuf = Buffer.from(body, 'binary');

  const headerLen = Buffer.byteLength(header, 'binary');
  const off1 = headerLen;
  const off2 = off1 + Buffer.byteLength(obj1, 'binary');
  const off3 = off2 + Buffer.byteLength(obj2, 'binary');
  const off4 = off3 + Buffer.byteLength(obj3, 'binary');

  const pad = (n) => String(n).padStart(10, '0');
  const e = '\r\n';
  const xref = `xref\n0 5\n${pad(0)} 65535 f ${e}${pad(off1)} 00000 n ${e}${pad(off2)} 00000 n ${e}${pad(off3)} 00000 n ${e}${pad(off4)} 00000 n ${e}`;
  const startxref = bodyBuf.length;
  const trailer = `${xref}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.concat([bodyBuf, Buffer.from(trailer, 'binary')]);
}

const emptyPdf = buildEmptyPdf();
writeFileSync(join(fixturesDir, 'image-only.pdf'), emptyPdf);
console.log(`Created image-only.pdf (${emptyPdf.length} bytes)`);

console.log('All fixtures created.');
