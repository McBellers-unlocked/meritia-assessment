import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";

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
  const auth = await requireAdmin();
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
  let parser: { destroy(): Promise<void> } | null = null;
  try {
    if (format === "pdf") {
      // pdf-parse v2+ uses a class API and pulls in pdf.js — import it lazily
      // so the dev server doesn't choke on first compile of unrelated routes.
      const { PDFParse } = await import("pdf-parse");
      const p = new PDFParse({ data: bytes });
      parser = p;
      const result = await p.getText();
      text = result.text;
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
  } finally {
    // PDFParse holds a worker reference; release it so the lambda can recycle.
    if (parser) await parser.destroy().catch(() => {});
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

  return NextResponse.json({
    text,
    filename: file.name,
    byteSize: file.size,
    format,
  });
}
