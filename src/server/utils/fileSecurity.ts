import { PDFParse } from 'pdf-parse';
import { AppError } from '../middleware/errorHandler.ts';
import { sanitizePlainText } from '../middleware/sanitize.ts';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const EXTENSION_TO_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
};

function matchesPrefix(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[i] !== bytes[i]) return false;
  }
  return true;
}

export function validateFileSignature(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): void {
  if (!buffer || buffer.length === 0) {
    throw new AppError(400, 'EMPTY_FILE', 'Uploaded file is empty');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError(
      400,
      'FILE_TOO_LARGE',
      'Uploaded file exceeds the 20 MB limit'
    );
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AppError(
      400,
      'UNSUPPORTED_FILE_TYPE',
      'Allowed file types are PDF, DOCX, PPTX, PNG, JPEG, WEBP, and GIF'
    );
  }

  const lower = originalName.toLowerCase();
  const extMatch = Object.keys(EXTENSION_TO_MIME).find((ext) =>
    lower.endsWith(ext)
  );
  if (!extMatch || !EXTENSION_TO_MIME[extMatch].includes(mimeType)) {
    throw new AppError(
      400,
      'FILE_EXTENSION_MISMATCH',
      'File extension does not match the declared MIME type'
    );
  }

  // Magic-byte verification
  if (mimeType === 'application/pdf') {
    // Allow optional leading whitespace/BOM before %PDF-
    const head = buffer.subarray(0, 16).toString('ascii');
    if (!head.includes('%PDF-')) {
      throw new AppError(
        400,
        'INVALID_FILE_SIGNATURE',
        'File signature does not match a valid PDF document'
      );
    }
    return;
  }

  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    // OOXML documents are ZIP containers starting with PK\x03\x04
    if (!matchesPrefix(buffer, [0x50, 0x4b, 0x03, 0x04])) {
      throw new AppError(
        400,
        'INVALID_FILE_SIGNATURE',
        'File signature does not match a valid DOCX/PPTX archive'
      );
    }
    return;
  }

  if (mimeType === 'image/png') {
    if (!matchesPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      throw new AppError(
        400,
        'INVALID_FILE_SIGNATURE',
        'File signature does not match PNG'
      );
    }
    return;
  }

  if (mimeType === 'image/jpeg') {
    if (!matchesPrefix(buffer, [0xff, 0xd8, 0xff])) {
      throw new AppError(
        400,
        'INVALID_FILE_SIGNATURE',
        'File signature does not match JPEG'
      );
    }
    return;
  }

  if (mimeType === 'image/gif') {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (header !== 'GIF87a' && header !== 'GIF89a') {
      throw new AppError(
        400,
        'INVALID_FILE_SIGNATURE',
        'File signature does not match GIF'
      );
    }
    return;
  }

  if (mimeType === 'image/webp') {
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.subarray(8, 12).toString('ascii');
    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new AppError(
        400,
        'INVALID_FILE_SIGNATURE',
        'File signature does not match WEBP'
      );
    }
  }
}

export function sanitizeFilename(name: string): string {
  const cleaned = sanitizePlainText(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 140);
  return cleaned || 'resource';
}

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export async function extractPdfPagesFromBuffer(
  buffer: Buffer
): Promise<{ text: string; pageCount: number; pages: ExtractedPdfPage[] }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const rawPages = Array.isArray(result.pages) ? result.pages : [];
    const pages: ExtractedPdfPage[] = rawPages
      .map((p, idx) => ({
        pageNumber: typeof p.num === 'number' && p.num > 0 ? p.num : idx + 1,
        text: (p.text || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((p) => p.text.length > 0);

    const fullText = (result.text || '').trim();
    if (pages.length === 0 && fullText.length > 0) {
      pages.push({ pageNumber: 1, text: fullText.replace(/\s+/g, ' ').trim() });
    }

    return {
      text: fullText,
      pageCount: result.total || pages.length || 0,
      pages,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function extractPdfTextFromBuffer(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  const extracted = await extractPdfPagesFromBuffer(buffer);
  return {
    text: extracted.text,
    pageCount: extracted.pageCount,
  };
}
