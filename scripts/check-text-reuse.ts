/**
 * Standalone checks for the lexical text-reuse analyzer. The repo has no test
 * framework, so this is a dependency-free assertion script (doubles as living
 * docs of the expected behaviour).
 *
 *   npx tsx scripts/check-text-reuse.ts
 *
 * Exits non-zero if any case fails.
 */
import { analyzeTextReuse, DEFAULT_THRESHOLD } from "../src/lib/recruit/textReuse";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log("        ", JSON.stringify(detail));
  }
}

// 1. Verbatim paste of a long sentence -> flagged, similarity ~1.
{
  const ai = ["The municipality failed to recognise the impairment loss on its infrastructure assets under IPSAS 21."];
  const memo = "<p>The municipality failed to recognise the impairment loss on its infrastructure assets under IPSAS 21.</p>";
  const r = analyzeTextReuse(memo, ai);
  check("verbatim: 1 sentence", r.numSentences === 1, r);
  check("verbatim: flagged", r.numReusedSentences === 1, r);
  check("verbatim: reuseRatio == 1", r.reuseRatio === 1, r);
  check("verbatim: similarity >= 0.95", (r.sentences[0]?.similarity ?? 0) >= 0.95, r.sentences[0]);
}

// 2. Unrelated content -> nothing flagged, originality 1.
{
  const ai = ["Depreciation schedules must align with the asset useful life under the applicable standard."];
  const memo = "<p>I really enjoyed cooking fresh pasta with garden tomatoes last weekend.</p>";
  const r = analyzeTextReuse(memo, ai);
  check("unrelated: nothing flagged", r.numReusedSentences === 0, r);
  check("unrelated: reuseRatio 0", r.reuseRatio === 0, r);
  check("unrelated: originality 1", r.originalityScore === 1, r);
}

// 3. Same words, reordered -> high word-Dice -> flagged.
{
  const ai = ["The board approved the revised budget after a lengthy and difficult debate yesterday."];
  const memo = "<p>After a lengthy and difficult debate yesterday the board approved the revised budget.</p>";
  const r = analyzeTextReuse(memo, ai);
  check("reordered: flagged", r.numReusedSentences === 1, r.sentences[0]);
}

// 4. One-word edit of a long AI sentence -> high char-shingle -> flagged.
{
  const ai = ["Management should disclose the contingent liability arising from the ongoing litigation in the notes to the financial statements."];
  const memo = "<p>Management should disclose the contingent liability arising from the ongoing arbitration in the notes to the financial statements.</p>";
  const r = analyzeTextReuse(memo, ai);
  check("one-word-edit: flagged", r.numReusedSentences === 1, r.sentences[0]);
  check("one-word-edit: similarity >= threshold", (r.sentences[0]?.similarity ?? 0) >= DEFAULT_THRESHOLD, r.sentences[0]);
}

// 5. Short identical sentence -> never flagged (too generic), still counted.
{
  const ai = ["I agree."];
  const memo = "<p>I agree.</p>";
  const r = analyzeTextReuse(memo, ai);
  check("short: counted", r.numSentences === 1, r);
  check("short: not flagged", r.numReusedSentences === 0, r);
}

// 6. Empty memo -> zeros, no throw.
{
  const r = analyzeTextReuse("", ["Some long AI sentence that the candidate could have copied verbatim here."]);
  check("empty-memo: zero sentences", r.numSentences === 0, r);
  check("empty-memo: reuseRatio 0", r.reuseRatio === 0, r);
  check("empty-memo: originality 1", r.originalityScore === 1, r);
}

// 7. No AI interactions -> zeros, no throw.
{
  const r = analyzeTextReuse("<p>This is a reasonably long memo sentence with several words.</p>", []);
  check("no-ai: one sentence", r.numSentences === 1, r);
  check("no-ai: nothing flagged", r.numReusedSentences === 0, r);
  check("no-ai: originality 1", r.originalityScore === 1, r);
}

// 8. HTML entities decode and the memo splits into sentences.
{
  const memo = "<p>Revenue &amp; expenses must be matched; the entity&#39;s deferral was improper.</p>";
  const r = analyzeTextReuse(memo, ["unrelated"]);
  const joined = r.sentences.map((s) => s.memoSentence).join(" ");
  check("entities: at least one sentence", r.numSentences >= 1, r);
  check("entities: ampersand decoded", joined.includes("Revenue & expenses"), joined);
  check("entities: apostrophe decoded", joined.includes("entity's"), joined);
}

console.log("");
if (failures > 0) {
  console.log(`FAILED: ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("All text-reuse checks passed.");
}
