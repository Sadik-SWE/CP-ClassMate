import type { ExtractedPdfPage } from '../../utils/fileSecurity.ts';

export interface TextChunk {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
}

const DEFAULT_TARGET_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;

/**
 * Estimates token count (~1.3 tokens per whitespace-delimited word, bounded by char/4).
 */
export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const charEst = Math.ceil(trimmed.length / 4);
  return Math.max(words, Math.round((words * 1.3 + charEst) / 2));
}

/**
 * Splits per-page PDF text into ~500-token chunks with ~50-token overlap while preserving page numbers.
 */
export function chunkTextPages(
  pages: ExtractedPdfPage[],
  options: { targetTokens?: number; overlapTokens?: number } = {}
): TextChunk[] {
  const targetTokens = Math.max(80, options.targetTokens ?? DEFAULT_TARGET_TOKENS);
  const overlapTokens = Math.max(
    0,
    Math.min(Math.floor(targetTokens / 2), options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS)
  );

  // Convert token targets to approximate word budgets (~1.3 tokens per word)
  const targetWords = Math.max(40, Math.floor(targetTokens / 1.3));
  const overlapWords = Math.max(0, Math.floor(overlapTokens / 1.3));
  const stepWords = Math.max(20, targetWords - overlapWords);

  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const clean = page.text.replace(/\s+/g, ' ').trim();
    if (!clean) continue;

    const words = clean.split(' ').filter(Boolean);
    if (words.length <= targetWords) {
      chunks.push({
        chunkIndex,
        pageNumber: page.pageNumber,
        content: clean,
        tokenCount: estimateTokenCount(clean),
      });
      chunkIndex += 1;
      continue;
    }

    let start = 0;
    while (start < words.length) {
      const end = Math.min(words.length, start + targetWords);
      const sliceText = words.slice(start, end).join(' ');
      if (sliceText.trim().length > 0) {
        chunks.push({
          chunkIndex,
          pageNumber: page.pageNumber,
          content: sliceText,
          tokenCount: estimateTokenCount(sliceText),
        });
        chunkIndex += 1;
      }
      if (end >= words.length) break;
      start += stepWords;
    }
  }

  return chunks;
}
