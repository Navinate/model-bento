// Import from lib/ to avoid pdf-parse's index.js debug mode
// which tries to load a test file on import
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function parsePdf(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds maximum allowed size of 20MB`);
  }

  const result = await pdfParse(buffer);
  return result.text;
}
