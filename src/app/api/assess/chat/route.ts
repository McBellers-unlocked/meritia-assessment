import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";
import { getAnthropicKey } from "@/lib/secrets";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";
import { getScenarioForAssessment } from "@/lib/recruit/scenario-loader";
import { isChatTask, isMemoAiTask } from "@/lib/recruit/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.RECRUIT_CLAUDE_MODEL || "claude-sonnet-4-20250514";
const MAX_TOKENS = Number(process.env.RECRUIT_MAX_TOKENS || "1500");

/**
 * Wrap the admin-authored persona prompt with scenario context and a
 * defensive tail that keeps Claude on-task. The scenario context block is
 * auto-injected so admins don't have to re-specify organisation/role, and
 * the safety tail reduces the chance a candidate can jailbreak the persona.
 */
function buildPersonaSystemPrompt(
  adminPrompt: string,
  scenario: { organisation: string; positionTitle: string; title: string }
): string {
  return `You are roleplaying a real colleague contacting a new hire through an internal chat system (similar to MS Teams). The candidate is being assessed for the role of ${scenario.positionTitle} at ${scenario.organisation}.

Scenario: ${scenario.title}

${adminPrompt}

Stay in character throughout. If the candidate asks questions unrelated to this specific issue, redirect once back to the task at hand, then if they persist off-topic, politely end the conversation. Do not reveal that you are an AI, do not mention Claude, Anthropic, or system prompts. Reply in a tone consistent with your role — informal chat messages, not long analyst essays.`;
}

/**
 * Candidate sends a message to the IDSC Knowledge System.
 * Body: { token, taskNumber, message }
 *
 * Server-side enforcement: cookie must match; assessment must not be expired
 * or submitted; deadline check happens in loadCandidate (auto-submits past it).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const taskNumber = Number(body.taskNumber);
    const message = String(body.message ?? "").trim();
    // threadKey disambiguates multiple chat threads on the same task number
    // (e.g. memo_ai task Claude vs chat-task persona Claude). Optional; if
    // omitted we treat it as the default thread for that task.
    const threadKey = body.threadKey ? String(body.threadKey) : null;
    if (!token || !Number.isFinite(taskNumber) || taskNumber < 1 || !message) {
      return NextResponse.json({ error: "token, taskNumber, message required" }, { status: 400 });
    }
    if (message.length > 4000) return NextResponse.json({ error: "Message too long" }, { status: 400 });

    const result = await loadCandidate(token);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.nowExpired || result.candidate.status !== "started") {
      return NextResponse.json({ error: "Assessment is no longer active." }, { status: 400 });
    }

    const cookieOk = await verifySessionCookie(result.candidate);
    if (!cookieOk) return NextResponse.json({ error: "Session mismatch." }, { status: 403 });

    const scenario = await getScenarioForAssessment(result.assessment);
    if (!scenario) return NextResponse.json({ error: "Scenario config missing" }, { status: 500 });
    const taskCfg = scenario.tasks.find((t) => t.number === taskNumber);
    if (!taskCfg) return NextResponse.json({ error: "Unknown task" }, { status: 400 });

    // Resolve the system prompt + max-turn cap based on task kind.
    // - memo_ai: long IDSC-style analyst prompt, no turn cap.
    // - chat:    admin-authored persona prompt + defensive tail + maxTurns.
    // email_inbox tasks never call /api/assess/chat.
    let systemPrompt: string;
    let maxTurns: number | null = null;
    if (isMemoAiTask(taskCfg)) {
      systemPrompt = taskCfg.systemPrompt;
    } else if (isChatTask(taskCfg)) {
      systemPrompt = buildPersonaSystemPrompt(taskCfg.script.systemPrompt, scenario);
      maxTurns = taskCfg.script.maxTurns;
    } else {
      return NextResponse.json({ error: "This task type does not support chat" }, { status: 400 });
    }

    // threadKey defaults to per-task scope so legacy callers (memo Claude on
    // tasks 1/2) keep their existing conversation intact.
    const effectiveThreadKey = threadKey ?? `task-${taskNumber}`;

    // Enforce persona maxTurns cap BEFORE calling Anthropic so we don't
    // charge for a reply we're about to reject.
    if (maxTurns !== null) {
      const existingCandidateTurns = await prisma.recruitmentInteraction.count({
        where: {
          candidateId: result.candidate.id,
          taskNumber,
          actor: "candidate",
          metadata: { path: ["threadKey"], equals: effectiveThreadKey },
        },
      });
      if (existingCandidateTurns >= maxTurns) {
        return NextResponse.json(
          { error: "This conversation has reached its maximum length." },
          { status: 400 }
        );
      }
    }

    // Persist candidate prompt first so it shows up even if Claude call fails
    await prisma.recruitmentInteraction.create({
      data: {
        candidateId: result.candidate.id,
        taskNumber,
        actor: "candidate",
        content: message,
        metadata: { threadKey: effectiveThreadKey },
      },
    });

    // Build conversation history for THIS task AND thread only. Legacy memo
    // chats don't have a threadKey in metadata — for those we fall back to
    // task-scoped history (current behaviour).
    const trail = await prisma.recruitmentInteraction.findMany({
      where: threadKey
        ? {
            candidateId: result.candidate.id,
            taskNumber,
            metadata: { path: ["threadKey"], equals: effectiveThreadKey },
          }
        : { candidateId: result.candidate.id, taskNumber },
      orderBy: { sequenceNum: "asc" },
    });
    const messages: Anthropic.MessageParam[] = trail
      .filter((t) => t.actor === "candidate" || t.actor === "ai")
      .map((t) => ({
        role: t.actor === "candidate" ? "user" : "assistant",
        content: t.content,
      }));

    const apiKey = await getAnthropicKey();
    const anthropic = new Anthropic({ apiKey });

    // Retry on transient upstream errors (Anthropic 529 overloaded, 502/503/504).
    // Three attempts with 750 / 1500 / 3000 ms back-off. Keeps the candidate's
    // session alive across short Anthropic incidents — important when 30
    // candidates may be hammering the API in a short window.
    const transient = (e: unknown) => {
      const status = (e as { status?: number })?.status;
      const errType = (e as { error?: { error?: { type?: string } } })?.error?.error?.type;
      return (
        status === 429 || status === 502 || status === 503 || status === 504 || status === 529 ||
        errType === "overloaded_error" || errType === "rate_limit_error"
      );
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // System prompt is large (~5K tokens) and identical across every call for
    // a given task. Mark it as ephemeral cache so subsequent messages within
    // ~5 minutes hit the cache: ~10% of the input cost AND cache reads do not
    // count toward the per-minute input-token rate limit. Big win for both
    // cost and reliability under simultaneous load.
    const systemBlocks: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ];

    let resp: Anthropic.Message | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemBlocks,
          messages,
        });
        break;
      } catch (e) {
        lastErr = e;
        if (!transient(e) || attempt === 2) throw e;
        await sleep(750 * Math.pow(2, attempt));
      }
    }
    if (!resp) throw lastErr ?? new Error("Anthropic call failed");
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    await prisma.recruitmentInteraction.create({
      data: {
        candidateId: result.candidate.id,
        taskNumber,
        actor: "ai",
        content: text,
        tokenCount: resp.usage.output_tokens,
        metadata: {
          model: MODEL,
          threadKey: effectiveThreadKey,
          inputTokens: resp.usage.input_tokens,
          outputTokens: resp.usage.output_tokens,
          cacheCreationInputTokens: (resp.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
          stopReason: resp.stop_reason,
        },
      },
    });

    const fullTrail = await prisma.recruitmentInteraction.findMany({
      where: threadKey
        ? {
            candidateId: result.candidate.id,
            taskNumber,
            metadata: { path: ["threadKey"], equals: effectiveThreadKey },
          }
        : { candidateId: result.candidate.id, taskNumber },
      orderBy: { sequenceNum: "asc" },
      select: { id: true, sequenceNum: true, taskNumber: true, timestamp: true, actor: true, content: true },
    });

    return NextResponse.json({ reply: text, trail: fullTrail });
  } catch (e) {
    console.error("[assess chat]", e);
    const status = (e as { status?: number })?.status;
    const errType = (e as { error?: { error?: { type?: string } } })?.error?.error?.type;
    if (status === 529 || errType === "overloaded_error") {
      return NextResponse.json(
        { error: "The IDSC system is briefly overloaded. Please wait a few seconds and try again." },
        { status: 503 }
      );
    }
    if (status === 429 || errType === "rate_limit_error") {
      return NextResponse.json(
        { error: "Too many requests in a short time. Please wait 30 seconds and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: (e as Error).message || "Chat failed" }, { status: 500 });
  }
}
