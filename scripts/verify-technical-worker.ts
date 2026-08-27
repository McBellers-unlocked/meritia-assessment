import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { buildKnowledgePolicy } from "../src/lib/recruit/assessment-modes";
import { CODE_EXECUTION_SYSTEM_INSTRUCTIONS } from "../src/lib/recruit/code-execution";
import { enqueueCandidateCodeExecutionJob } from "../src/lib/recruit/sqs-client";
import { buildSourceContext, htmlToPlainText } from "../src/lib/recruit/source-verification";
import {
  COHORT_TITLE,
  EXHIBIT_HTML,
  EXHIBIT_SOURCE_ID,
  EXHIBIT_TITLE,
  KNOWLEDGE_SYSTEM_PROMPT,
} from "./technical-demo/scenario";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const assessment = await prisma.recruitmentAssessment.findFirst({
    where: { title: COHORT_TITLE },
    orderBy: { createdAt: "desc" },
    include: { candidates: { orderBy: { anonymousId: "asc" } } },
  });
  if (!assessment || assessment.candidates.length === 0) {
    throw new Error("Seed the technical demo before verifying its worker.");
  }
  const candidate =
    assessment.candidates.find((item) => item.status === "started") ??
    assessment.candidates[0];
  const taskNumber = 1;
  const threadKey = `worker-verification-${Date.now()}`;
  const message =
    "Use Python to load the validation CSV, compute the confusion matrix and false-negative rate by contract_type, and show exact code and stdout.";
  const systemPrompt = `${buildKnowledgePolicy("COPILOT")}

SCENARIO-SPECIFIC KNOWLEDGE AND INSTRUCTIONS
${KNOWLEDGE_SYSTEM_PROMPT}

AVAILABLE SOURCES
${buildSourceContext([{
  id: EXHIBIT_SOURCE_ID,
  title: EXHIBIT_TITLE,
  text: htmlToPlainText(EXHIBIT_HTML),
  html: EXHIBIT_HTML,
}])}
${CODE_EXECUTION_SYSTEM_INSTRUCTIONS}`;

  const request = await prisma.recruitmentInteraction.create({
    data: {
      candidateId: candidate.id,
      taskNumber,
      actor: "candidate",
      content: message,
      metadata: { threadKey, codeExecutionStatus: "queued", verificationRun: true },
      assessmentMode: "COPILOT",
      promptPolicyVersion: "candidate-code-execution-v1",
      contentVersion: "candidate-code-execution-v1",
    },
  });

  await enqueueCandidateCodeExecutionJob({
    candidateInteractionId: request.id,
    candidateId: candidate.id,
    taskNumber,
    threadKey,
    assessmentMode: "COPILOT",
    systemPrompt,
    messages: [{ role: "user", content: message }],
  });
  console.log(`Queued worker verification ${request.id}.`);

  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(2_000);
    const [requestState, reply] = await Promise.all([
      prisma.recruitmentInteraction.findUnique({
        where: { id: request.id },
        select: { metadata: true },
      }),
      prisma.recruitmentInteraction.findFirst({
        where: {
          candidateId: candidate.id,
          actor: "ai",
          metadata: { path: ["requestInteractionId"], equals: request.id },
        },
        select: { metadata: true, content: true },
      }),
    ]);
    if (reply) {
      const metadata = reply.metadata as Record<string, unknown> | null;
      if (metadata?.codeExecutionUsed !== true || !reply.content.trim()) {
        throw new Error("Worker returned a reply without verified Python execution.");
      }
      console.log(
        `Worker verification passed in ${String(metadata.elapsedMs ?? "unknown")}ms; ` +
        `${reply.content.length} response characters.`
      );
      return;
    }
    const metadata = requestState?.metadata as Record<string, unknown> | null;
    if (metadata?.codeExecutionStatus === "failed") {
      throw new Error(String(metadata.codeExecutionError ?? "Worker execution failed."));
    }
  }
  throw new Error("Worker verification timed out after two minutes.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
