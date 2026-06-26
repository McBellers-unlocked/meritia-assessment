/**
 * Lexical text-reuse analyzer for the marking screen's integrity signals.
 *
 * Measures how much of a candidate's memo overlaps with the AI "knowledge
 * system" output they saw during the assessment — i.e. did they paste the AI
 * chat output straight into their answer. This is a deliberately LEXICAL
 * (string-overlap) measure, not a semantic-embedding one: the concern is
 * literal copy-paste, which lexical similarity detects precisely with zero
 * dependencies, instantly, and deterministically. Semantic similarity would
 * over-flag honest candidates who independently discuss the same facts the AI
 * mentioned.
 *
 * The output mirrors the supplied Python `TextReuseAnalyzer`: a reuse ratio,
 * an originality score, a reused-sentence count, and a per-sentence breakdown.
 * It is ADVISORY ONLY — surfaced to the human marker, never affecting scoring.
 */

export interface ReuseSentence {
  /** Candidate sentence, trimmed, original casing. */
  memoSentence: string;
  /** Most-similar AI sentence (original casing), "" if none. */
  bestAiSentence: string;
  /** 0..1, max over the metrics, rounded to 3 dp. */
  similarity: number;
  /** similarity >= threshold AND the sentence has >= MIN_SENTENCE_WORDS words. */
  isReused: boolean;
}

export interface ReuseResult {
  /** numReusedSentences / numSentences (0 if no sentences), rounded to 3 dp. */
  reuseRatio: number;
  /** 1 - reuseRatio, rounded to 3 dp. */
  originalityScore: number;
  numSentences: number;
  numReusedSentences: number;
  /** Echoed for the UI label. */
  threshold: number;
  sentences: ReuseSentence[];
}

export interface AnalyzeOptions {
  threshold?: number;
}

/**
 * Flagging threshold for a single sentence. At 0.8, char-shingle similarity is
 * near-verbatim with only minor edits and word-overlap is ~80% shared
 * vocabulary — specific to actual paste. Lowering it (~0.6) starts catching
 * paraphrase / shared-topic, which produces false positives.
 */
export const DEFAULT_THRESHOLD = 0.8;

// Sentences shorter than this (in words) are never flagged — too generic to be
// meaningful evidence of paste ("I agree.", "This is correct."). They still
// count toward the denominator so the ratio is not inflated.
const MIN_SENTENCE_WORDS = 5;
// Caps to bound the O(n*m) comparison on pathological inputs. The full memo
// still renders elsewhere on the marking screen — this only bounds analysis.
const MAX_MEMO_SENTENCES = 400;
const MAX_AI_SENTENCES = 1200;
// Character shingle (n-gram) length for near-verbatim matching.
const CHAR_SHINGLE_N = 4;

// Sentinel used to temporarily mask periods inside abbreviations/decimals so
// the sentence splitter does not break on them. Restored to "." afterwards.
// Written as an escape so the source file stays plain ASCII; it is not a regex
// metacharacter, so it is safe to use directly in new RegExp.
const DOT_SENTINEL = "\u0001";

/**
 * Analyze a candidate memo against the AI texts they saw. Never throws: an
 * empty/whitespace memo or empty `aiTexts` yields zeros (reuseRatio 0,
 * originalityScore 1, no sentences).
 */
export function analyzeTextReuse(
  memoHtml: string,
  aiTexts: string[],
  opts?: AnalyzeOptions,
): ReuseResult {
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;

  const memoText = stripHtml(memoHtml ?? "");
  const aiText = normalizeAiText(aiTexts ?? []);

  const memoSentences = splitSentences(memoText).slice(0, MAX_MEMO_SENTENCES);
  const aiSentences = splitSentences(aiText).slice(0, MAX_AI_SENTENCES);

  const empty: ReuseResult = {
    reuseRatio: 0,
    originalityScore: 1,
    numSentences: 0,
    numReusedSentences: 0,
    threshold,
    sentences: [],
  };
  if (memoSentences.length === 0) return empty;

  // Precompute each AI sentence's token set + shingle set once, outside the
  // memo loop — the comparison is otherwise O(n*m) and would re-tokenize.
  const aiPrepared = aiSentences.map((original) => {
    const normalized = normalizeForCompare(original);
    return {
      original,
      tokenSet: tokenSet(normalized),
      shingleSet: charShingles(normalized),
    };
  });

  const sentences: ReuseSentence[] = [];
  let numReused = 0;

  for (const memoSentence of memoSentences) {
    const normalized = normalizeForCompare(memoSentence);
    const memoTokens = tokenSet(normalized);
    const memoShingles = charShingles(normalized);

    let best = 0;
    let bestAi = "";
    for (const ai of aiPrepared) {
      const sim = Math.max(
        diceCoefficient(memoTokens, ai.tokenSet),
        jaccard(memoShingles, ai.shingleSet),
      );
      if (sim > best) {
        best = sim;
        bestAi = ai.original;
      }
    }

    const longEnough = memoTokens.size >= MIN_SENTENCE_WORDS;
    const isReused = longEnough && best >= threshold;
    if (isReused) numReused += 1;

    sentences.push({
      memoSentence,
      bestAiSentence: bestAi,
      similarity: round3(best),
      isReused,
    });
  }

  const numSentences = sentences.length;
  const reuseRatio = numSentences ? numReused / numSentences : 0;
  return {
    reuseRatio: round3(reuseRatio),
    originalityScore: round3(1 - reuseRatio),
    numSentences,
    numReusedSentences: numReused,
    threshold,
    sentences,
  };
}

/* ------------------------------ text extraction ------------------------------ */

/**
 * Convert sanitized Tiptap/HTML memo content to plain text. Mirrors the
 * `stripTags` + `decodeEntities` idiom in src/lib/recruit/itu-jobs.ts
 * (re-implemented locally so the scraper module stays untouched and we avoid a
 * server-side DOM dependency).
 */
function stripHtml(html: string): string {
  let text = html
    // Block-level tags become newlines so sentences don't run together.
    .replace(/<\/?(p|br|div|li|h[1-6]|tr|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    // Strip all remaining tags.
    .replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  return collapseWhitespace(text);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Normalize the AI markdown into plain text for comparison. Code blocks are
 * dropped entirely (pasting code is out of scope and distorts tokenization);
 * inline markdown markers are stripped; links collapse to their text.
 */
function normalizeAiText(aiTexts: string[]): string {
  // Join with a blank line so adjacent messages don't merge into one sentence.
  let text = aiTexts.join("\n\n");
  text = text
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/[*_]+/g, "") // bold/italic markers
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s*[-*+]\s+/gm, "") // unordered list bullets
    .replace(/^\s*\d+\.\s+/gm, ""); // ordered list markers
  return collapseWhitespace(text);
}

function collapseWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

/* ------------------------------ sentence split ------------------------------- */

// Single-word abbreviations whose trailing period must not end a sentence.
const ABBREVIATIONS = [
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "no", "st",
  "inc", "ltd", "co", "corp", "dept", "fig", "approx", "est", "al",
];

/**
 * Split text into sentences without nltk. Newlines are treated as soft
 * boundaries (memo paragraphs / list items are natural units); within a line we
 * split on sentence terminators. Known abbreviations, single-letter initials
 * and decimal numbers have their periods masked first so they don't split.
 *
 * Trade-offs (acceptable — the char-shingle metric is robust to small fragment
 * differences): ellipses, unusual abbreviations and mid-sentence "U.S.A."-style
 * acronyms may split imperfectly.
 */
function splitSentences(text: string): string[] {
  if (!text) return [];
  const masked = maskAbbreviationPeriods(text);
  const out: string[] = [];
  for (const line of masked.split("\n")) {
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      const restored = part.replace(new RegExp(DOT_SENTINEL, "g"), ".").trim();
      if (restored) out.push(restored);
    }
  }
  return out;
}

function maskAbbreviationPeriods(text: string): string {
  let s = text;
  // Decimal numbers: 3.5 -> 3<sentinel>5
  s = s.replace(/(\d)\.(\d)/g, `$1${DOT_SENTINEL}$2`);
  // "e.g." / "i.e." (both internal periods).
  s = s.replace(
    /\b([ei])\.([ge])\./gi,
    `$1${DOT_SENTINEL}$2${DOT_SENTINEL}`,
  );
  // Known single-word abbreviations.
  const abbr = new RegExp(`\\b(${ABBREVIATIONS.join("|")})\\.`, "gi");
  s = s.replace(abbr, `$1${DOT_SENTINEL}`);
  // Single-letter initials, e.g. "J. Smith".
  s = s.replace(/\b([A-Za-z])\./g, `$1${DOT_SENTINEL}`);
  return s;
}

/* ------------------------------ similarity ----------------------------------- */

/** Lowercase, drop non-alphanumerics, collapse whitespace. */
function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(normalized: string): Set<string> {
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter(Boolean));
}

/** Set of all length-N character substrings of the normalized string. */
function charShingles(normalized: string): Set<string> {
  const out = new Set<string>();
  if (!normalized) return out;
  if (normalized.length <= CHAR_SHINGLE_N) {
    out.add(normalized);
    return out;
  }
  for (let i = 0; i + CHAR_SHINGLE_N <= normalized.length; i++) {
    out.add(normalized.slice(i, i + CHAR_SHINGLE_N));
  }
  return out;
}

/** Dice coefficient over two sets: 2|A∩B| / (|A|+|B|). Robust to reordering. */
function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return (2 * intersectionSize(a, b)) / (a.size + b.size);
}

/** Jaccard over two sets: |A∩B| / |A∪B|. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const inter = intersectionSize(a, b);
  return inter / (a.size + b.size - inter);
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  // Iterate the smaller set for speed. Uses forEach rather than for...of so it
  // compiles under the project's pre-ES2015 tsconfig target without requiring
  // downlevelIteration (matches the Set handling elsewhere in the codebase).
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  small.forEach((x) => {
    if (large.has(x)) n += 1;
  });
  return n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
