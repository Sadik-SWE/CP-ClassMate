const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'by',
  'with',
  'from',
  'which',
  'what',
  'when',
  'where',
  'who',
  'how',
  'why',
  'that',
  'this',
  'these',
  'those',
  'following',
  'true',
  'false',
  'not',
]);

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSignificant(normalized: string): Set<string> {
  const tokens = normalized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  if (tokens.length > 0) return new Set(tokens);
  return new Set(normalized.split(' ').filter(Boolean));
}

function charBigrams(normalized: string): Map<string, number> {
  const compact = normalized.replace(/\s+/g, ' ');
  const counts = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i += 1) {
    const bg = compact.slice(i, i + 2);
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  return counts;
}

function diceBigrams(normA: string, normB: string): number {
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.length < 2 || normB.length < 2) return 0;

  const mapA = charBigrams(normA);
  const mapB = charBigrams(normB);
  let totalA = 0;
  let totalB = 0;
  let overlap = 0;

  for (const v of mapA.values()) totalA += v;
  for (const v of mapB.values()) totalB += v;

  for (const [bg, countA] of mapA.entries()) {
    const countB = mapB.get(bg) ?? 0;
    overlap += Math.min(countA, countB);
  }

  return totalA + totalB > 0 ? (2 * overlap) / (totalA + totalB) : 0;
}

/**
 * Computes a deterministic 0..1 similarity score combining token Jaccard and
 * character bigram Dice similarity for fast duplicate question detection.
 */
export function computeTextSimilarity(rawA: string, rawB: string): number {
  const normA = normalizeQuestionText(rawA);
  const normB = normalizeQuestionText(rawB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const setA = tokenizeSignificant(normA);
  const setB = tokenizeSignificant(normB);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  const dice = diceBigrams(normA, normB);

  return Math.round((0.55 * jaccard + 0.45 * dice) * 1000) / 1000;
}
