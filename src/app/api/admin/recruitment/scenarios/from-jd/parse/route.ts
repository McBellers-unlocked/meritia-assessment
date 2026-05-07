import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { requireScenarioBuilder } from "@/lib/admin-auth";
import { getAnthropicKey } from "@/lib/secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — JDs are tiny; this just keeps abuse out
const MAX_TEXT_LENGTH = 60_000; // ~12-15K tokens — well within Opus 4.7 input budget

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * POST /api/admin/recruitment/scenarios/from-jd/parse
 *   multipart/form-data: { file: File }
 *   → { text: string, filename: string, byteSize: number, format: "pdf" | "docx" }
 *
 * Server-side parsing keeps the parsers (and any worker threads they spawn)
 * out of the browser bundle. The original file is never persisted — only
 * the extracted text is returned to the client, which can then send it to
 * the generate-task endpoint.
 */
export async function POST(request: NextRequest) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024}MB)` },
      { status: 413 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Branch on MIME first; fall back to file extension for browsers that
  // mis-report (Edge has been known to serve .docx as octet-stream).
  let format: "pdf" | "docx";
  if (file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf")) {
    format = "pdf";
  } else if (
    file.type === DOCX_MIME ||
    file.name.toLowerCase().endsWith(".docx")
  ) {
    format = "docx";
  } else {
    return NextResponse.json(
      { error: "Only PDF and DOCX files are supported" },
      { status: 400 }
    );
  }

  let text: string;
  try {
    if (format === "pdf") {
      // unpdf wraps pdfjs-dist with the polyfills it needs to run in
      // serverless Node (Lambda doesn't expose DOMMatrix etc., which
      // pdf-parse v2 used directly). Lazy import so the dev server
      // doesn't pull pdf.js into unrelated route compiles.
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const result = await extractText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
    } else {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value;
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to parse ${format.toUpperCase()}: ${(e as Error).message}` },
      { status: 422 }
    );
  }

  // Normalise whitespace — PDF extraction often produces ragged line breaks
  // and runs of spaces that waste tokens without adding meaning.
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    return NextResponse.json(
      { error: "No text extracted from the file. If it's a scanned PDF, run OCR first." },
      { status: 422 }
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
  }

  // Best-effort title extraction. Brittle regex heuristics (e.g. matching
  // "Position:" or the first capitalised line) catch section headers like
  // "Position Description" instead of the actual title — a model call gets
  // it right far more reliably. Failures here don't block upload; the user
  // can type the title themselves on the next step.
  let suggestedJobTitle: string | null = null;
  try {
    suggestedJobTitle = await extractJobTitle(text);
  } catch {
    suggestedJobTitle = null;
  }

  return NextResponse.json({
    text,
    filename: file.name,
    byteSize: file.size,
    format,
    suggestedJobTitle,
  });
}

async function extractJobTitle(jdText: string): Promise<string | null> {
  const apiKey = await getAnthropicKey();
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 100,
    thinking: { type: "disabled" },
    system:
      "You extract the job title from a job description. Reply with ONLY the title, no preamble, no quotes, no period at the end. If there is no clear job title, reply with the single word: Unknown",
    messages: [
      {
        role: "user",
        content: `Job description:\n\n${jdText.slice(0, 4000)}\n\nJob title:`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  if (!textBlock) return null;

  const raw = textBlock.text.trim().replace(/^["']|["']$/g, "").trim();
  if (!raw || raw.toLowerCase() === "unknown" || raw.length > 120) return null;
  return raw;
}
