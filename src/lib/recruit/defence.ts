import { DEFENCE_PROMPT_VERSION } from "./prompt-versions";

export const DEFENCE_QUESTION_COUNT = 2;
export const DEFENCE_DEFAULT_MINUTES = 5;
export const DEFENCE_FALLBACK_QUESTIONS = [
  "Which assumption in your submission has the greatest effect on your recommendation, and what evidence would make you change your view?",
  "Which source most influenced your conclusion, and what are the limits of what that source establishes?",
] as const;

export type DefenceQuestion = { id: string; text: string };
export type DefenceAnswer = { questionId: string; text: string; savedAt: string | null };

export function autosaveDefenceAnswer(
  answers: DefenceAnswer[],
  questionId: string,
  answer: string,
  savedAt: string
): DefenceAnswer[] | null {
  if (!answers.some((item) => item.questionId === questionId)) return null;
  return answers.map((item) =>
    item.questionId === questionId
      ? { ...item, text: answer.slice(0, 8_000), savedAt }
      : item
  );
}

export function fallbackDefenceQuestions(): DefenceQuestion[] {
  return DEFENCE_FALLBACK_QUESTIONS.map((text, index) => ({ id: `defence-${index + 1}`, text }));
}

export function normaliseDefenceQuestions(input: unknown): DefenceQuestion[] | null {
  if (!Array.isArray(input) || input.length !== DEFENCE_QUESTION_COUNT) return null;
  const questions = input.map((item, index) => {
    const raw = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>).text : item;
    const text = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
    return { id: `defence-${index + 1}`, text };
  });
  return questions.every((item) => item.text.length >= 20) ? questions : null;
}

export function defenceDeadline(startedAt: Date, minutes: number): Date {
  const safeMinutes = Number.isFinite(minutes) ? Math.min(30, Math.max(1, Math.round(minutes))) : DEFENCE_DEFAULT_MINUTES;
  return new Date(startedAt.getTime() + safeMinutes * 60_000);
}

export const DEFENCE_QUESTION_TOOL = {
  name: "return_defence_questions",
  description: "Return exactly two concise, neutral written reasoning-defence questions.",
  input_schema: {
    type: "object",
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
      },
    },
  },
} as const;

export function buildDefencePrompt(): string {
  return `You create exactly two concise written reasoning-defence questions for a professional assessment (${DEFENCE_PROMPT_VERSION}).
Use only the supplied submission, dialogue, evidence actions, exhibits and intended decision points. Do not infer identity or protected characteristics. Do not reveal rubric answers or accuse the candidate of AI use.
Each question must address one issue, be answerable in approximately 100-200 words, and test ownership, evidence, uncertainty, assumptions, conflict or reasons for accepting/rejecting assistance. Return only the required tool call.`;
}
