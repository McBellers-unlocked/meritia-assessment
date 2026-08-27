import type { KnowledgeEvidenceCard, KnowledgeSystemResponse } from "./knowledge-response-schema";

export type KnowledgeSource = { id: string; title: string; text: string; html?: string; openable?: boolean };

export function makeSourceId(title: string, ordinal?: number): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 48) || "SOURCE";
  return ordinal ? `${slug}-${ordinal}` : slug;
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseSourceText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

export function excerptMatchesSource(excerpt: string, sourceText: string): boolean {
  const needle = normaliseSourceText(excerpt);
  const haystack = normaliseSourceText(sourceText);
  if (needle.length < 8 || !haystack) return false;
  if (haystack.includes(needle)) return true;
  // Models occasionally collapse punctuation around table cells. Compare
  // same-length contiguous word windows as a conservative fallback; this
  // tolerates small punctuation/token changes without accepting a cherry-
  // picked sequence assembled from unrelated parts of a long exhibit.
  const words = needle.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  const sourceWords = haystack.split(/\s+/);
  const minimum = Math.ceil(words.length * 0.8);
  for (let start = 0; start <= sourceWords.length - words.length; start++) {
    let matched = 0;
    for (let index = 0; index < words.length; index++) {
      if (sourceWords[start + index] === words[index]) matched += 1;
    }
    if (matched >= minimum) return true;
  }
  return false;
}

export function validateEvidenceCard(card: KnowledgeEvidenceCard, sources: KnowledgeSource[]): KnowledgeEvidenceCard {
  if (card.basis === "inference") {
    return { ...card, sourceId: null, sourceTitle: null, sourceExcerpt: null, sourceOpenable: false, verificationStatus: "inference", verificationNote: "Explicit professional inference; no direct source claimed." };
  }
  const source = sources.find((item) => item.id === card.sourceId);
  if (!source) {
    return { ...card, sourceOpenable: false, verificationStatus: "unverified", verificationNote: "Returned source ID is not present in this task." };
  }
  if (!card.sourceExcerpt || !excerptMatchesSource(card.sourceExcerpt, source.text)) {
    return { ...card, sourceTitle: source.title, sourceOpenable: false, verificationStatus: "unverified", verificationNote: "The source exists, but the quoted excerpt could not be matched." };
  }
  return { ...card, sourceTitle: source.title, sourceOpenable: source.openable !== false, verificationStatus: "verified", verificationNote: "Source ID and excerpt matched the supplied material." };
}

export function validateKnowledgeSources(response: KnowledgeSystemResponse, sources: KnowledgeSource[]): KnowledgeSystemResponse {
  return { ...response, evidenceCards: response.evidenceCards.map((card) => validateEvidenceCard(card, sources)) };
}

export function buildSourceContext(sources: KnowledgeSource[]): string {
  return sources
    .map((source) => `SOURCE ID: ${source.id}\nSOURCE TITLE: ${source.title}\nSOURCE TEXT:\n${source.text}`)
    .join("\n\n---\n\n");
}
