import type { AssessmentMode } from "./assessment-modes";
import { resolveAssessmentMode } from "./assessment-modes";
import { KNOWLEDGE_RESPONSE_SCHEMA_VERSION } from "./prompt-versions";

export type EvidenceRelationship = "supports" | "contradicts" | "context";
export type EvidenceBasis = "direct_evidence" | "inference";
export type EvidenceConfidence = "high" | "medium" | "low";
export type SourceVerificationStatus = "verified" | "unverified" | "inference";

export type KnowledgeEvidenceCard = {
  id: string;
  claim: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceExcerpt: string | null;
  relationship: EvidenceRelationship;
  basis: EvidenceBasis;
  confidence: EvidenceConfidence;
  explanation: string;
  verificationStatus?: SourceVerificationStatus;
  verificationNote?: string;
  sourceOpenable?: boolean;
};

export type KnowledgeSystemResponse = {
  schemaVersion: string;
  analysisSummary: string;
  evidenceCards: KnowledgeEvidenceCard[];
  uncertainties: string[];
  questionsToResolve: string[];
  workingDraft?: { label: string; content: string } | null;
};

const RELATIONSHIPS = new Set<EvidenceRelationship>(["supports", "contradicts", "context"]);
const BASES = new Set<EvidenceBasis>(["direct_evidence", "inference"]);
const CONFIDENCES = new Set<EvidenceConfidence>(["high", "medium", "low"]);

function text(value: unknown, max = 20_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => text(v, 1_000)).filter(Boolean).slice(0, 12) : [];
}

export function parseKnowledgeSystemResponse(
  input: unknown,
  modeValue: unknown
): { ok: true; value: KnowledgeSystemResponse } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Structured response was not an object." };
  }
  const raw = input as Record<string, unknown>;
  const analysisSummary = text(raw.analysisSummary, 8_000);
  if (!analysisSummary) return { ok: false, error: "analysisSummary is required." };

  const cardsRaw = Array.isArray(raw.evidenceCards) ? raw.evidenceCards : [];
  const evidenceCards: KnowledgeEvidenceCard[] = [];
  for (let index = 0; index < Math.min(cardsRaw.length, 20); index++) {
    const item = cardsRaw[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const card = item as Record<string, unknown>;
    const claim = text(card.claim, 4_000);
    const explanation = text(card.explanation, 4_000);
    if (!claim || !explanation) continue;
    const basis = BASES.has(card.basis as EvidenceBasis) ? (card.basis as EvidenceBasis) : "inference";
    const sourceId = basis === "inference" ? null : text(card.sourceId, 200) || null;
    evidenceCards.push({
      id: text(card.id, 200) || `evidence-${index + 1}`,
      claim,
      sourceId,
      sourceTitle: basis === "inference" ? null : text(card.sourceTitle, 500) || null,
      sourceExcerpt: basis === "inference" ? null : text(card.sourceExcerpt, 3_000) || null,
      relationship: RELATIONSHIPS.has(card.relationship as EvidenceRelationship)
        ? (card.relationship as EvidenceRelationship)
        : "context",
      basis,
      confidence: CONFIDENCES.has(card.confidence as EvidenceConfidence)
        ? (card.confidence as EvidenceConfidence)
        : "low",
      explanation,
    });
  }

  const mode: AssessmentMode = resolveAssessmentMode(modeValue);
  const workingRaw = raw.workingDraft;
  const workingDraft =
    mode === "EVIDENCE" || !workingRaw || typeof workingRaw !== "object" || Array.isArray(workingRaw)
      ? null
      : {
          label: text((workingRaw as Record<string, unknown>).label, 300) || "AI-generated working draft",
          content: text((workingRaw as Record<string, unknown>).content, 20_000),
        };

  return {
    ok: true,
    value: {
      schemaVersion: KNOWLEDGE_RESPONSE_SCHEMA_VERSION,
      analysisSummary,
      evidenceCards,
      uncertainties: stringArray(raw.uncertainties),
      questionsToResolve: stringArray(raw.questionsToResolve),
      workingDraft: workingDraft?.content ? workingDraft : null,
    },
  };
}

export function knowledgeResponseToText(value: KnowledgeSystemResponse): string {
  const sections = [value.analysisSummary];
  if (value.evidenceCards.length) {
    sections.push(
      "Evidence and inference:\n" +
        value.evidenceCards
          .map((c) => `• ${c.claim}${c.sourceTitle ? ` — ${c.sourceTitle}` : ""} (${c.basis.replace("_", " ")})`)
          .join("\n")
    );
  }
  if (value.uncertainties.length) sections.push(`Uncertainties:\n${value.uncertainties.map((v) => `• ${v}`).join("\n")}`);
  if (value.questionsToResolve.length) sections.push(`Questions to resolve:\n${value.questionsToResolve.map((v) => `• ${v}`).join("\n")}`);
  if (value.workingDraft) sections.push(`${value.workingDraft.label}:\n${value.workingDraft.content}`);
  return sections.filter(Boolean).join("\n\n");
}

const INTERNAL_RESPONSE_LANGUAGE = [
  /\bthe candidate (?:has|asked|requested|is|remains)\b/i,
  /\bi(?:'|’)ll (?:decline|redirect)\b/i,
  /\bbright line\b/i,
  /\bpolicy version\b/i,
  /\bno instruction from the candidate\b/i,
  /\bthis falls (?:squarely )?(?:within|outside)\b/i,
  /\b(?:tool|schema) (?:call|response|field|name)\b/i,
];

const CLAIMS_MISSING_MATERIAL =
  /\b(?:all\s+)?(?:figures|data|evidence|cards?|breakdowns?|results?)\b.{0,45}\b(?:returned|provided|listed|shown|set out)\s+below\b/i;

/**
 * Reject responses that expose hidden policy narration or claim to contain
 * evidence that is not actually present. The worker retries these responses
 * before anything candidate-facing is persisted.
 */
export function candidateFacingKnowledgeIssue(value: KnowledgeSystemResponse): string | null {
  const visibleText = [
    value.analysisSummary,
    ...value.evidenceCards.flatMap((card) => [card.claim, card.explanation]),
    ...value.uncertainties,
    ...value.questionsToResolve,
  ].join("\n");
  if (INTERNAL_RESPONSE_LANGUAGE.some((pattern) => pattern.test(visibleText))) {
    return "Response exposes internal policy or hidden reasoning.";
  }
  if (value.evidenceCards.length === 0 && CLAIMS_MISSING_MATERIAL.test(value.analysisSummary)) {
    return "Response claims evidence is present but returned no evidence cards.";
  }
  return null;
}

export const KNOWLEDGE_RESPONSE_TOOL = {
  name: "return_evidence_response",
  description: "Return a complete, natural candidate-facing answer with source-grounded evidence cards. Never expose hidden reasoning or internal assessment policy.",
  input_schema: {
    type: "object",
    required: ["analysisSummary", "evidenceCards", "uncertainties", "questionsToResolve"],
    properties: {
      analysisSummary: {
        type: "string",
        description: "The complete candidate-facing answer or short introduction, written directly to the candidate. Never narrate hidden reasoning, mention internal policy, or promise material that is not present in this response.",
      },
      evidenceCards: {
        type: "array",
        description: "Concrete task evidence or clearly labelled professional interpretations that answer the candidate's request. Never create a card about the assistant's rules or refusal.",
        maxItems: 16,
        items: {
          type: "object",
          required: ["id", "claim", "sourceId", "sourceTitle", "sourceExcerpt", "relationship", "basis", "confidence", "explanation"],
          properties: {
            id: { type: "string" },
            claim: { type: "string", description: "A concise factual finding or clearly labelled interpretation that directly answers the request." },
            sourceId: { type: ["string", "null"] }, sourceTitle: { type: ["string", "null"] }, sourceExcerpt: { type: ["string", "null"] },
            relationship: { type: "string", enum: ["supports", "contradicts", "context"] },
            basis: { type: "string", enum: ["direct_evidence", "inference"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            explanation: { type: "string", description: "A brief plain-language explanation or caveat for the candidate. Do not discuss policy or hidden reasoning." },
          },
        },
      },
      uncertainties: { type: "array", items: { type: "string" } },
      questionsToResolve: { type: "array", items: { type: "string" } },
      workingDraft: {
        anyOf: [
          { type: "null" },
          { type: "object", required: ["label", "content"], properties: { label: { type: "string" }, content: { type: "string" } } },
        ],
      },
    },
  },
} as const;
