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

export const KNOWLEDGE_RESPONSE_TOOL = {
  name: "return_evidence_response",
  description: "Return a source-grounded Knowledge System response in the required evidence-card structure.",
  input_schema: {
    type: "object",
    required: ["analysisSummary", "evidenceCards", "uncertainties", "questionsToResolve"],
    properties: {
      analysisSummary: { type: "string" },
      evidenceCards: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "claim", "sourceId", "sourceTitle", "sourceExcerpt", "relationship", "basis", "confidence", "explanation"],
          properties: {
            id: { type: "string" }, claim: { type: "string" },
            sourceId: { type: ["string", "null"] }, sourceTitle: { type: ["string", "null"] }, sourceExcerpt: { type: ["string", "null"] },
            relationship: { type: "string", enum: ["supports", "contradicts", "context"] },
            basis: { type: "string", enum: ["direct_evidence", "inference"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            explanation: { type: "string" },
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
