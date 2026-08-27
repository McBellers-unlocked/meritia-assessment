export const CANDIDATE_KNOWLEDGE_MODEL = "claude-sonnet-4-6";
export const CANDIDATE_KNOWLEDGE_MAX_TOKENS = 6_000;
export const CANDIDATE_KNOWLEDGE_POLICY_VERSION = "knowledge-policy-v2";
export const CANDIDATE_KNOWLEDGE_SCHEMA_VERSION = "knowledge-response-v1";
export const CANDIDATE_KNOWLEDGE_CONTENT_VERSION = "1";

export const CANDIDATE_KNOWLEDGE_TOOL = {
  name: "return_evidence_response",
  description:
    "Return a complete, natural candidate-facing answer with source-grounded evidence cards. Never expose hidden reasoning or internal assessment policy.",
  input_schema: {
    type: "object",
    required: ["analysisSummary", "evidenceCards", "uncertainties", "questionsToResolve"],
    properties: {
      analysisSummary: {
        type: "string",
        description:
          "The complete candidate-facing answer or short introduction, written directly to the candidate. Never narrate hidden reasoning, mention internal policy, or promise material that is not present in this response.",
      },
      evidenceCards: {
        type: "array",
        description:
          "Concrete task evidence or clearly labelled professional interpretations that answer the candidate's request. Never create a card about the assistant's rules or refusal.",
        maxItems: 16,
        items: {
          type: "object",
          required: [
            "id",
            "claim",
            "sourceId",
            "sourceTitle",
            "sourceExcerpt",
            "relationship",
            "basis",
            "confidence",
            "explanation",
          ],
          properties: {
            id: { type: "string" },
            claim: {
              type: "string",
              description:
                "A concise factual finding or clearly labelled interpretation that directly answers the request.",
            },
            sourceId: { type: ["string", "null"] },
            sourceTitle: { type: ["string", "null"] },
            sourceExcerpt: { type: ["string", "null"] },
            relationship: {
              type: "string",
              enum: ["supports", "contradicts", "context"],
            },
            basis: {
              type: "string",
              enum: ["direct_evidence", "inference"],
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
            explanation: {
              type: "string",
              description:
                "A brief plain-language explanation or caveat for the candidate. Do not discuss policy or hidden reasoning.",
            },
          },
        },
      },
      uncertainties: { type: "array", items: { type: "string" } },
      questionsToResolve: { type: "array", items: { type: "string" } },
      workingDraft: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            required: ["label", "content"],
            properties: {
              label: { type: "string" },
              content: { type: "string" },
            },
          },
        ],
      },
    },
  },
};

const RELATIONSHIPS = new Set(["supports", "contradicts", "context"]);
const BASES = new Set(["direct_evidence", "inference"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);

function cleanText(value, max = 20_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, 1_000)).filter(Boolean).slice(0, 12)
    : [];
}

export function parseCandidateKnowledgeResponse(input, assessmentMode) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Structured response was not an object." };
  }
  const analysisSummary = cleanText(input.analysisSummary, 8_000);
  if (!analysisSummary) {
    return { ok: false, error: "analysisSummary is required." };
  }

  const cardsRaw = Array.isArray(input.evidenceCards) ? input.evidenceCards : [];
  const evidenceCards = [];
  for (let index = 0; index < Math.min(cardsRaw.length, 20); index += 1) {
    const raw = cardsRaw[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const claim = cleanText(raw.claim, 4_000);
    const explanation = cleanText(raw.explanation, 4_000);
    if (!claim || !explanation) continue;
    const basis = BASES.has(raw.basis) ? raw.basis : "inference";
    evidenceCards.push({
      id: cleanText(raw.id, 200) || `evidence-${index + 1}`,
      claim,
      sourceId: basis === "inference" ? null : cleanText(raw.sourceId, 200) || null,
      sourceTitle:
        basis === "inference" ? null : cleanText(raw.sourceTitle, 500) || null,
      sourceExcerpt:
        basis === "inference" ? null : cleanText(raw.sourceExcerpt, 3_000) || null,
      relationship: RELATIONSHIPS.has(raw.relationship)
        ? raw.relationship
        : "context",
      basis,
      confidence: CONFIDENCES.has(raw.confidence) ? raw.confidence : "low",
      explanation,
    });
  }

  const workingRaw = input.workingDraft;
  const workingDraft =
    assessmentMode === "EVIDENCE" ||
    !workingRaw ||
    typeof workingRaw !== "object" ||
    Array.isArray(workingRaw)
      ? null
      : {
          label: cleanText(workingRaw.label, 300) || "AI-generated working draft",
          content: cleanText(workingRaw.content, 20_000),
        };

  return {
    ok: true,
    value: {
      schemaVersion: CANDIDATE_KNOWLEDGE_SCHEMA_VERSION,
      analysisSummary,
      evidenceCards,
      uncertainties: stringArray(input.uncertainties),
      questionsToResolve: stringArray(input.questionsToResolve),
      workingDraft: workingDraft?.content ? workingDraft : null,
    },
  };
}

function normaliseSourceText(value) {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

function excerptMatchesSource(excerpt, sourceText) {
  const needle = normaliseSourceText(excerpt);
  const haystack = normaliseSourceText(sourceText);
  if (needle.length < 8 || !haystack) return false;
  if (haystack.includes(needle)) return true;
  const words = needle.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  const sourceWords = haystack.split(/\s+/);
  const minimum = Math.ceil(words.length * 0.8);
  for (let start = 0; start <= sourceWords.length - words.length; start += 1) {
    let matched = 0;
    for (let index = 0; index < words.length; index += 1) {
      if (sourceWords[start + index] === words[index]) matched += 1;
    }
    if (matched >= minimum) return true;
  }
  return false;
}

export function validateCandidateKnowledgeSources(response, sources) {
  return {
    ...response,
    evidenceCards: response.evidenceCards.map((card) => {
      if (card.basis === "inference") {
        return {
          ...card,
          sourceId: null,
          sourceTitle: null,
          sourceExcerpt: null,
          sourceOpenable: false,
          verificationStatus: "inference",
          verificationNote: "Explicit professional inference; no direct source claimed.",
        };
      }
      const source = sources.find((item) => item.id === card.sourceId);
      if (!source) {
        return {
          ...card,
          sourceOpenable: false,
          verificationStatus: "unverified",
          verificationNote: "Returned source ID is not present in this task.",
        };
      }
      if (!card.sourceExcerpt || !excerptMatchesSource(card.sourceExcerpt, source.text)) {
        return {
          ...card,
          sourceTitle: source.title,
          sourceOpenable: false,
          verificationStatus: "unverified",
          verificationNote: "The source exists, but the quoted excerpt could not be matched.",
        };
      }
      return {
        ...card,
        sourceTitle: source.title,
        sourceOpenable: source.openable !== false,
        verificationStatus: "verified",
        verificationNote: "Source ID and excerpt matched the supplied material.",
      };
    }),
  };
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
const EVIDENCE_REQUEST =
  /\b(?:figure|figures|data|breakdown|attrition|engagement|participation|item-level|scores?|themes?|costs?|benchmarks?|compare|comparison|excerpts?|rosters?|tenure|shift)\b/i;
const AUTHORSHIP_REQUEST =
  /\b(?:write|draft|compose|complete|final memo|make (?:the )?recommendations?|what should i recommend|key takeaways?|outline|structure)\b/i;

export function candidateKnowledgeQualityIssue(response, candidateMessage = "") {
  const visibleText = [
    response.analysisSummary,
    ...response.evidenceCards.flatMap((card) => [card.claim, card.explanation]),
    ...response.uncertainties,
    ...response.questionsToResolve,
  ].join("\n");
  if (INTERNAL_RESPONSE_LANGUAGE.some((pattern) => pattern.test(visibleText))) {
    return "Response exposes internal policy or hidden reasoning.";
  }
  if (
    response.evidenceCards.length === 0 &&
    CLAIMS_MISSING_MATERIAL.test(response.analysisSummary)
  ) {
    return "Response claims evidence is present but returned no evidence cards.";
  }
  if (
    response.evidenceCards.length === 0 &&
    EVIDENCE_REQUEST.test(candidateMessage) &&
    !AUTHORSHIP_REQUEST.test(candidateMessage)
  ) {
    return "Candidate requested task data, but the response returned no evidence cards.";
  }
  return null;
}

export function buildCandidateKnowledgeSystemPrompt(policyPrompt, sources, retryReason = "") {
  const sourceContext = sources
    .map(
      (source) =>
        `SOURCE ID: ${source.id}\nSOURCE TITLE: ${source.title}\nSOURCE TEXT:\n${source.text}`
    )
    .join("\n\n---\n\n");
  return `${policyPrompt}

AVAILABLE TRUSTED MATERIAL
${sourceContext}

RESPONSE CONTRACT
- Return only the return_evidence_response tool.
- Use only the SOURCE IDs above. Copy direct-evidence excerpts from the corresponding source text. Use basis=inference with no source only for genuine professional interpretation.
- The analysisSummary is candidate-facing text, not hidden reasoning. Address the candidate directly and naturally.
- For a prohibited authorship request, give a brief plain-language boundary and practical redirection. Return no policy/rule evidence card.
- For a data request, return the actual figures and caveats now, using concise evidence cards. Do not merely announce that data has been returned.
- Keep cards focused and non-duplicative. A broad request may use up to 16 cards; combine closely related figures in one card where this remains clear.
${retryReason ? `\nThe previous attempt was rejected before display because: ${retryReason}\nProduce a fresh, complete response. Do not mention the rejected attempt.` : ""}`;
}

export function candidateKnowledgeResponseToText(value) {
  const sections = [value.analysisSummary];
  if (value.evidenceCards.length) {
    sections.push(
      "Evidence:\n" +
        value.evidenceCards
          .map(
            (card) =>
              `• ${card.claim}${card.sourceTitle ? ` — ${card.sourceTitle}` : ""}`
          )
          .join("\n")
    );
  }
  if (value.uncertainties.length) {
    sections.push(`Things to check:\n${value.uncertainties.map((item) => `• ${item}`).join("\n")}`);
  }
  if (value.questionsToResolve.length) {
    sections.push(`You could explore:\n${value.questionsToResolve.map((item) => `• ${item}`).join("\n")}`);
  }
  if (value.workingDraft) {
    sections.push(`${value.workingDraft.label}:\n${value.workingDraft.content}`);
  }
  return sections.filter(Boolean).join("\n\n");
}
