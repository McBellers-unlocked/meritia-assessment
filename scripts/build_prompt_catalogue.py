#!/usr/bin/env python3
"""
Build a PDF catalogue of every prompt UNIQAssess sends to the Anthropic (Claude) API.

Prompt bodies are extracted VERBATIM from the source files (no transcription),
so this stays correct as long as the symbol markers below still exist. Run:

    pip install weasyprint
    python3 scripts/build_prompt_catalogue.py

Outputs:
    docs/PROMPT_CATALOGUE.html   (intermediate, human-readable)
    docs/PROMPT_CATALOGUE.pdf    (the deliverable)
"""
import html
import os
import subprocess
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
LAMBDA = os.path.join(ROOT, "lambda", "task-generator")
DOCS = os.path.join(ROOT, "docs")


def read(*parts):
    with open(os.path.join(ROOT, *parts), "r", encoding="utf-8") as f:
        return f.read()


# --------------------------------------------------------------------------
# Verbatim extractors
# --------------------------------------------------------------------------
def extract_tl(content, marker):
    """Return the contents of the JS/TS template literal that begins right
    after `marker`. Unescapes \\` , \\$ and \\\\ ; leaves ${...} intact."""
    i = content.index(marker) + len(marker)
    assert content[i] == "`", f"expected backtick after {marker!r}, got {content[i]!r}"
    i += 1
    out = []
    while i < len(content):
        c = content[i]
        if c == "\\" and i + 1 < len(content) and content[i + 1] in "`$\\":
            out.append(content[i + 1])
            i += 2
            continue
        if c == "`":
            return "".join(out)
        out.append(c)
        i += 1
    raise ValueError(f"unterminated template literal for {marker!r}")


def extract_block(content, start_substr, end_line):
    """Raw source from the line containing `start_substr` through the first
    later line that equals `end_line` exactly (no indentation)."""
    lines = content.splitlines()
    start = next(n for n, l in enumerate(lines) if start_substr in l)
    end = next(n for n in range(start + 1, len(lines)) if lines[n] == end_line)
    return "\n".join(lines[start : end + 1])


def after(content, marker):
    return content[content.index(marker):]


# --------------------------------------------------------------------------
# Read sources
# --------------------------------------------------------------------------
chat_route = read("src", "app", "api", "assess", "chat", "route.ts")
criteria = read("src", "lib", "recruit", "criteria-extractor.ts")
prompt_mjs = read("lambda", "task-generator", "prompt.mjs")
fromjd = read("src", "app", "api", "admin", "recruitment", "scenarios", "from-jd", "route.ts")
chat_editor = read("src", "components", "admin", "recruit", "ChatTaskEditor.tsx")
fam = read("src", "lib", "recruit", "fam-p4-2026.ts")
aplo = read("src", "lib", "recruit", "aplo-p2-2026.ts")
cso = read("src", "lib", "recruit", "cso-p3-2026.ts")

# Builder prompts
TITLE_SYS = ("You extract the job title from a job description. Reply with ONLY the "
             "title, no preamble, no quotes, no period at the end. If there is no clear "
             "job title, reply with the single word: Unknown")
TITLE_USER = "Job description:\n\n${jdText.slice(0, 4000)}\n\nJob title:"

CRITERIA_SYS = extract_tl(criteria, "const SYSTEM_PROMPT = ")
CRITERIA_TOOL = extract_block(criteria, "const REPORT_CRITERIA_TOOL", "};")
CRITERIA_USER = extract_block(criteria, "function buildUserMessage(", "}")

TASK_SYS = extract_tl(prompt_mjs, "export const SYSTEM_PROMPT = ")
TASK_TOOL = extract_block(prompt_mjs, "export const PROPOSE_TASK_TOOL", "};")
TASK_USER = extract_block(prompt_mjs, "export function buildUserMessageContent(", "}")

RUBRIC_SYS = extract_tl(prompt_mjs, "export const RUBRIC_SYSTEM_PROMPT = ")
RUBRIC_TOOL = extract_block(prompt_mjs, "export const PROPOSE_RUBRIC_TOOL", "};")
RUBRIC_USER = extract_block(prompt_mjs, "export function buildRubricUserMessageContent(", "}")

# IDSC knowledge-system prompts
DEFAULT_MEMO = extract_tl(after(fromjd, "function defaultMemoSystemPrompt"), "return ")
AUTHOR_HINT = ("You are the [Organisation] Analysis System... Think of yourself as a "
               "smart analyst sitting next to the candidate...")

T1_MARK = "const TASK1_SYSTEM_PROMPT = "
T2_MARK = "const TASK2_SYSTEM_PROMPT = "
T2_PREFIX = "${TASK1_SYSTEM_PROMPT}"


def task2_body(full):
    """(is_extension, text). FAM/APLO Task 2 = Task 1 + appended block;
    CSO Task 2 is a standalone second persona."""
    if full.startswith(T2_PREFIX):
        return True, full[len(T2_PREFIX):].lstrip("\n")
    return False, full


FAM1 = extract_tl(fam, T1_MARK)
FAM2_EXT, FAM2 = task2_body(extract_tl(fam, T2_MARK))
APLO1 = extract_tl(aplo, T1_MARK)
APLO2_EXT, APLO2 = task2_body(extract_tl(aplo, T2_MARK))
CSO1 = extract_tl(cso, T1_MARK)
CSO2_EXT, CSO2 = task2_body(extract_tl(cso, T2_MARK))


def t2_caption(is_ext):
    return "appended to the Task 1 prompt" if is_ext else "standalone system prompt"

# Chatbot prompts
PERSONA_WRAPPER = extract_tl(after(chat_route, "function buildPersonaSystemPrompt"), "return ")
DEFAULT_PERSONA = extract_tl(chat_editor, "const DEFAULT_PERSONA_PROMPT = ")

GIT_SHA = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                         capture_output=True, text=True).stdout.strip()
TODAY = date.today().isoformat()

# --------------------------------------------------------------------------
# HTML assembly
# --------------------------------------------------------------------------
H = []
esc = lambda s: html.escape(s, quote=False)


def h(level, text, anchor=None):
    a = f' id="{anchor}"' if anchor else ""
    H.append(f"<h{level}{a}>{esc(text)}</h{level}>")


def p(text):
    H.append(f"<p>{text}</p>")


def prompt(text):
    H.append(f'<pre class="prompt">{esc(text)}</pre>')


def code(text):
    H.append(f'<pre class="code">{esc(text)}</pre>')


def label(text):
    H.append(f'<p class="blocklabel">{esc(text)}</p>')


def meta(rows):
    cells = "".join(
        f'<tr><th>{esc(k)}</th><td>{v}</td></tr>' for k, v in rows
    )
    H.append(f'<table class="meta">{cells}</table>')


CSS = """
@page {
  size: A4;
  margin: 1.7cm 1.6cm 1.9cm 1.6cm;
  @bottom-center { content: counter(page) " / " counter(pages);
                   font: 8pt sans-serif; color: #8a93a6; }
  @bottom-left   { content: "UNIQAssess — API Prompt Catalogue";
                   font: 8pt sans-serif; color: #8a93a6; }
}
@page :first { @bottom-center { content: ""; } @bottom-left { content: ""; } }
* { box-sizing: border-box; }
body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 10pt;
       color: #1f2733; line-height: 1.45; }
h1 { font-size: 21pt; color: #1B2A4A; margin: 0 0 .2em; }
h2 { font-size: 15pt; color: #1B2A4A; border-bottom: 2px solid #1B2A4A;
     padding-bottom: 3px; margin: 1.6em 0 .6em; break-after: avoid; }
h3 { font-size: 12pt; color: #243a63; margin: 1.3em 0 .4em; break-after: avoid; }
h4 { font-size: 10.5pt; color: #3a4a66; margin: 1.1em 0 .3em; break-after: avoid;
     text-transform: uppercase; letter-spacing: .03em; }
p { margin: .45em 0; }
a { color: #1B2A4A; text-decoration: none; }
code { font-family: "DejaVu Sans Mono", monospace; font-size: 9pt;
       background: #eef1f6; padding: 0 3px; border-radius: 3px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2; }
pre.prompt { font-family: "DejaVu Sans Mono", monospace; font-size: 8.2pt;
             line-height: 1.4; background: #f6f8fb; border: 1px solid #d6deea;
             border-left: 4px solid #1B2A4A; border-radius: 4px;
             padding: 10px 12px; margin: .5em 0; }
pre.code { font-family: "DejaVu Sans Mono", monospace; font-size: 7.8pt;
           line-height: 1.35; background: #1f2733; color: #e6edf6;
           border-radius: 4px; padding: 10px 12px; margin: .5em 0; }
p.blocklabel { font-size: 8.5pt; font-weight: 700; text-transform: uppercase;
               letter-spacing: .04em; color: #6b7587; margin: .9em 0 .1em; }
table.meta { border-collapse: collapse; width: 100%; margin: .5em 0 .2em;
             font-size: 8.8pt; break-inside: avoid; }
table.meta th { text-align: left; width: 26%; vertical-align: top;
                background: #eef1f6; color: #3a4a66; font-weight: 600;
                padding: 4px 8px; border: 1px solid #d6deea; }
table.meta td { padding: 4px 8px; border: 1px solid #d6deea; }
table.summary { border-collapse: collapse; width: 100%; font-size: 8.6pt;
                margin: .6em 0; }
table.summary th { background: #1B2A4A; color: #fff; text-align: left;
                   padding: 5px 7px; }
table.summary td { padding: 5px 7px; border: 1px solid #d6deea;
                   vertical-align: top; }
table.summary tr:nth-child(even) td { background: #f6f8fb; }
.cover { text-align: left; padding-top: 3.5cm; }
.cover .kicker { color: #6b7587; font-size: 10pt; letter-spacing: .12em;
                 text-transform: uppercase; }
.cover h1 { font-size: 28pt; margin-top: .2em; }
.cover .sub { font-size: 13pt; color: #3a4a66; margin-top: .3em; }
.cover .facts { margin-top: 2.2cm; font-size: 9.5pt; color: #3a4a66; }
.cover .facts b { color: #1f2733; }
.note { background: #fff8e6; border: 1px solid #f0d98a; border-radius: 4px;
        padding: 8px 12px; font-size: 9pt; margin: .7em 0; }
ul.toc { list-style: none; padding: 0; font-size: 10pt; }
ul.toc li { margin: 3px 0; }
ul.toc li.sub { margin-left: 1.2em; font-size: 9.2pt; color: #3a4a66; }
ul.toc a::after { content: leader('.') target-counter(attr(href), page);
                  color: #8a93a6; }
.pb { break-before: page; }
.unit { break-inside: avoid-page; }
"""

# ---- Cover ----
H.append('<div class="cover">')
H.append('<div class="kicker">UNIQAssess · Powered by UNICC</div>')
h(1, "Catalogue of Prompts Sent to the Claude API")
H.append('<div class="sub">Assessment Builder · IDSC Knowledge Systems · Persona Chatbot</div>')
H.append('<div class="facts">')
H.append(f"<p>Every system prompt, tool definition, and message template the platform "
         f"transmits to the Anthropic (Claude) API, reproduced verbatim from source and "
         f"grouped by the three subsystems that issue them.</p>")
H.append(f"<p style='margin-top:1.2cm'><b>Repository:</b> mcbellers-unlocked/meritia-assessment "
         f"&nbsp;·&nbsp; <b>Commit:</b> {esc(GIT_SHA)}<br>"
         f"<b>Generated:</b> {esc(TODAY)} &nbsp;·&nbsp; <b>SDK:</b> @anthropic-ai/sdk</p>")
H.append('</div></div>')

# ---- TOC ----
H.append('<div class="pb"></div>')
h(2, "Contents")
toc = [
    ("overview", "How prompts reach the API", False),
    ("builder", "1 · Assessment Builder (JD → scenario pipeline)", False),
    ("b-title", "1.1 Job-title extraction", True),
    ("b-criteria", "1.2 Selection-criteria extraction", True),
    ("b-task", "1.3 Task generation", True),
    ("b-rubric", "1.4 Marking-rubric generation", True),
    ("idsc", "2 · IDSC Knowledge Systems (in-scenario AI)", False),
    ("i-default", "2.1 Default knowledge-system prompt — new assessments", True),
    ("i-author", "2.2 Authoring guidance (builder UI)", True),
    ("i-fam", "2.3 Built-in — Finance & Accounting Manager (P4)", True),
    ("i-aplo", "2.4 Built-in — Associate Policy Officer, Legal (P2)", True),
    ("i-cso", "2.5 Built-in — Cybersecurity Operations Officer (P3)", True),
    ("chatbot", "3 · The Chatbot (persona chat)", False),
    ("c-wrapper", "3.1 Runtime persona wrapper", True),
    ("c-default", "3.2 Default persona prompt — new chat tasks", True),
    ("appendix", "Appendix · Models, caching & overrides", False),
]
H.append('<ul class="toc">')
for anchor, text, sub in toc:
    cls = ' class="sub"' if sub else ""
    H.append(f'<li{cls}><a href="#{anchor}">{esc(text)}</a></li>')
H.append("</ul>")

# ---- Overview ----
H.append('<div class="pb"></div>')
h(2, "How prompts reach the API", "overview")
p("UNIQAssess calls the Claude API from three places. <b>Assessment Builder</b> turns an "
  "uploaded job description into a ready-to-mark scenario (title, selection criteria, tasks, "
  "exhibits, rubrics). The <b>IDSC Knowledge Systems</b> are the in-scenario AI a candidate "
  "queries while writing their deliverable — data-retrieval personas that supply facts but "
  "withhold professional judgement. The <b>Chatbot</b> is a scripted persona that pops up "
  "mid-assessment to pressure-test the candidate in a live chat.")
p("Two call sites serve runtime traffic and two serve the builder:")
p("&bull; <code>src/app/api/assess/chat/route.ts</code> — the single runtime endpoint for "
  "<i>both</i> the IDSC Knowledge System (memo_ai tasks) and the persona chatbot (chat tasks). "
  "The system prompt is sent as an <code>ephemeral</code>-cached block.<br>"
  "&bull; <code>.../scenarios/from-jd/parse</code> &amp; <code>.../extract-criteria</code> — "
  "builder steps that call Claude in-process (SSR).<br>"
  "&bull; <code>lambda/task-generator/</code> — a worker Lambda (triggered via SQS) that runs "
  "the two long builder calls (task + rubric) outside the SSR timeout.")
h(4, "All prompts at a glance")
summary = [
    ("Builder", "Job-title extraction", "parse/route.ts", "claude-opus-4-7", "100", "SSR"),
    ("Builder", "Criteria extraction", "criteria-extractor.ts", "claude-opus-4-7", "1,500", "SSR"),
    ("Builder", "Task generation", "lambda/.../prompt.mjs", "claude-opus-4-7", "32,000", "Lambda"),
    ("Builder", "Rubric generation", "lambda/.../prompt.mjs", "claude-opus-4-7", "16,000", "Lambda"),
    ("IDSC KS", "Default KS prompt (new)", "from-jd/route.ts", "runtime model*", "1,500*", "SSR /chat"),
    ("IDSC KS", "Built-in FAM / APLO / CSO", "lib/recruit/*-2026.ts", "runtime model*", "1,500*", "SSR /chat"),
    ("Chatbot", "Persona wrapper (runtime)", "assess/chat/route.ts", "runtime model*", "1,500*", "SSR /chat"),
    ("Chatbot", "Default persona seed", "ChatTaskEditor.tsx", "runtime model*", "1,500*", "SSR /chat"),
]
rows = "".join(
    f"<tr><td>{esc(a)}</td><td>{esc(b)}</td><td><code>{esc(c)}</code></td>"
    f"<td>{esc(d)}</td><td>{esc(e)}</td><td>{esc(f)}</td></tr>"
    for a, b, c, d, e, f in summary
)
H.append('<table class="summary"><tr><th>Area</th><th>Prompt</th><th>Defined in</th>'
         '<th>Model</th><th>Max tokens</th><th>Sent from</th></tr>' + rows + "</table>")
H.append('<p style="font-size:8.5pt;color:#6b7587">* Runtime model is '
         '<code>RECRUIT_CLAUDE_MODEL</code> (default <code>claude-sonnet-4-20250514</code>); '
         'max tokens is <code>RECRUIT_MAX_TOKENS</code> (default 1,500). See appendix.</p>')

# =========================================================================
# 1 · ASSESSMENT BUILDER
# =========================================================================
H.append('<div class="pb"></div>')
h(2, "1 · Assessment Builder (JD → scenario pipeline)", "builder")
p("The builder runs four distinct Claude calls. A hiring manager uploads a JD (PDF/DOCX); "
  "the platform extracts a suggested title, then the selection criteria, then — for each "
  "criterion the manager ticks — generates a task (brief + exhibit + deliverable) and its "
  "marking rubric. The task and rubric calls share an <code>ephemeral</code>-cached JD prefix.")

h(3, "1.1 Job-title extraction", "b-title")
meta([("Defined in", "<code>src/app/api/admin/recruitment/scenarios/from-jd/parse/route.ts</code> "
       "→ <code>extractJobTitle()</code>"),
      ("Model", "<code>claude-opus-4-7</code>, <code>max_tokens: 100</code>, thinking disabled"),
      ("Sent from", "SSR, during JD upload/parse"),
      ("Purpose", "Best-effort title suggestion shown on the next wizard step")])
label("System prompt")
prompt(TITLE_SYS)
label("User message (template)")
code(TITLE_USER)

h(3, "1.2 Selection-criteria extraction", "b-criteria")
meta([("Defined in", "<code>src/lib/recruit/criteria-extractor.ts</code>"),
      ("Model", "<code>claude-opus-4-7</code>, <code>max_tokens: 1500</code>, thinking disabled"),
      ("Tool", "<code>report_criteria</code> (forced via <code>tool_choice: auto</code>)"),
      ("Sent from", "SSR via <code>extract-criteria/route.ts</code> (SSE stream)"),
      ("Caching", "JD text block marked <code>cache_control: ephemeral</code>")])
label("System prompt")
prompt(CRITERIA_SYS)
label("Tool definition (source)")
code(CRITERIA_TOOL)
label("User message builder (source)")
code(CRITERIA_USER)

h(3, "1.3 Task generation", "b-task")
meta([("Defined in", "<code>lambda/task-generator/prompt.mjs</code> (live) — mirrored in "
       "<code>src/lib/recruit/scenario-generator.ts</code>"),
      ("Model", "<code>claude-opus-4-7</code>, <code>max_tokens: 32000</code>, "
       "thinking adaptive, effort high"),
      ("Tool", "<code>propose_task</code>"),
      ("Sent from", "Worker Lambda, triggered by SQS from "
       "<code>from-jd/generate-task/route.ts</code>"),
      ("Caching", "JD/role prefix block marked <code>cache_control: ephemeral</code>")])
H.append('<div class="note">The SSR copy in <code>scenario-generator.ts</code> (which targets '
         '<code>claude-sonnet-4-6</code>) is kept byte-for-byte in sync but is <b>no longer in '
         'the runtime path</b> — generation moved to the Lambda to escape Amplify’s ~30s SSR '
         'timeout. The live prompt is the one below.</div>')
label("System prompt")
prompt(TASK_SYS)
label("Tool definition (source)")
code(TASK_TOOL)
label("User message builder (source)")
code(TASK_USER)

h(3, "1.4 Marking-rubric generation", "b-rubric")
meta([("Defined in", "<code>lambda/task-generator/prompt.mjs</code> (Lambda-only)"),
      ("Model", "<code>claude-opus-4-7</code>, <code>max_tokens: 16000</code>, "
       "thinking adaptive, effort high"),
      ("Tool", "<code>propose_rubric</code>"),
      ("Sent from", "Worker Lambda, immediately after the task call (warm cache)"),
      ("Behaviour", "Fails soft — a rubric error stores <code>rubric: null</code> and never "
       "blocks the task")])
label("System prompt")
prompt(RUBRIC_SYS)
label("Tool definition (source)")
code(RUBRIC_TOOL)
label("User message builder (source)")
code(RUBRIC_USER)

# =========================================================================
# 2 · IDSC KNOWLEDGE SYSTEMS
# =========================================================================
H.append('<div class="pb"></div>')
h(2, "2 · IDSC Knowledge Systems (in-scenario AI)", "idsc")
p("For a <code>memo_ai</code> task, the task’s <code>systemPrompt</code> is sent to the "
  "Claude API <b>as-is</b> (no wrapper) from <code>assess/chat/route.ts</code> each time the "
  "candidate queries the assistant, cached as an <code>ephemeral</code> block. Where that "
  "prompt comes from depends on how the assessment was created:")
p("&bull; <b>Newly created (JD-generated) assessments</b> — every memo_ai task is seeded with "
  "the default prompt in §2.1; the admin can then edit it in the scenario editor.<br>"
  "&bull; <b>Built-in scenarios</b> (§2.3–2.5) ship hand-authored prompts loaded with full "
  "reference data — these are the exemplars of the “naive, not helpful” design.")

h(3, "2.1 Default knowledge-system prompt — new assessments", "i-default")
meta([("Defined in", "<code>src/app/api/admin/recruitment/scenarios/from-jd/route.ts</code> "
       "→ <code>defaultMemoSystemPrompt(positionTitle, organisation)</code>"),
      ("Applied to", "Every memo_ai task created by the JD builder"),
      ("Sent from", "SSR <code>/api/assess/chat</code> at candidate runtime"),
      ("Note", "<code>${positionTitle}</code> / <code>${organisation}</code> are interpolated "
       "from the scenario")])
label("System prompt (template)")
prompt(DEFAULT_MEMO)

h(3, "2.2 Authoring guidance (builder UI)", "i-author")
p("Not a prompt sent to the API, but the guidance shown to admins writing a memo_ai system "
  "prompt in the scenario editor (<code>MemoTaskEditor.tsx</code>). Included for completeness "
  "as it shapes every hand-authored knowledge-system prompt.")
label("Editor placeholder text")
prompt(AUTHOR_HINT)

h(3, "2.3 Built-in — Finance & Accounting Manager (P4)", "i-fam")
p("Persona: <b>IDSC Financial Analysis System</b>. Source: "
  "<code>src/lib/recruit/fam-p4-2026.ts</code>. Two memo_ai tasks share a 120-minute budget; "
  "Task 2’s prompt is Task 1’s prompt with an appended data block.")
h(4, "Task 1 — IPSAS Compliance & Financial Statement Review · system prompt")
prompt(FAM1)
h(4, "Task 2 — Cost Allocation & Management Judgment · " + t2_caption(FAM2_EXT))
prompt(FAM2)

h(3, "2.4 Built-in — Associate Policy Officer, Legal (P2)", "i-aplo")
p("Persona: <b>IDSC Legal Knowledge System (LKS)</b>. Source: "
  "<code>src/lib/recruit/aplo-p2-2026.ts</code>. Task 2’s prompt extends Task 1’s.")
h(4, "Task 1 — Commercial Contract Review (Meridian MSA) · system prompt")
prompt(APLO1)
h(4, "Task 2 — AI / Cloud Procurement Advisory (Nexus) · " + t2_caption(APLO2_EXT))
prompt(APLO2)

h(3, "2.5 Built-in — Cybersecurity Operations Officer (P3)", "i-cso")
p("Two distinct personas (Task 2 is a separate standalone prompt, not an extension of Task 1). "
  "Source: <code>src/lib/recruit/cso-p3-2026.ts</code>. Task 2 is a deliberately mis-calibrated "
  "triage copilot — the prompt seeds confident-but-wrong and tentative-but-right dispositions "
  "to test whether the candidate pushes back.")
h(4, "Task 1 — IDSC SOC Reporting Assistant · system prompt")
prompt(CSO1)
h(4, "Task 2 — IDSC SOC Triage Assistant · " + t2_caption(CSO2_EXT))
prompt(CSO2)

# =========================================================================
# 3 · CHATBOT
# =========================================================================
H.append('<div class="pb"></div>')
h(2, "3 · The Chatbot (persona chat)", "chatbot")
p("A <code>chat</code> task fires a popup mid-assessment in which a scripted colleague "
  "pressures the candidate. Unlike the knowledge systems, the admin-authored persona prompt "
  "is <b>wrapped at runtime</b> with scenario context and a defensive tail before it is sent "
  "to Claude. A <code>maxTurns</code> cap bounds cost and the system block is "
  "<code>ephemeral</code>-cached.")

h(3, "3.1 Runtime persona wrapper", "c-wrapper")
meta([("Defined in", "<code>src/app/api/assess/chat/route.ts</code> → "
       "<code>buildPersonaSystemPrompt(adminPrompt, scenario)</code>"),
      ("Model", "runtime model (<code>RECRUIT_CLAUDE_MODEL</code>, default "
       "<code>claude-sonnet-4-20250514</code>), <code>max_tokens</code> default 1,500"),
      ("Sent from", "SSR <code>/api/assess/chat</code> when a chat task message is posted"),
      ("Note", "<code>${adminPrompt}</code> is the persona prompt (§3.2 seed, then admin-edited); "
       "the rest is interpolated scenario context")])
label("Wrapper system prompt (template — ${adminPrompt} is the persona body)")
prompt(PERSONA_WRAPPER)

h(3, "3.2 Default persona prompt — new chat tasks", "c-default")
meta([("Defined in", "<code>src/components/admin/recruit/ChatTaskEditor.tsx</code> → "
       "<code>DEFAULT_PERSONA_PROMPT</code>"),
      ("Applied to", "Every new chat task, as the editable starting point"),
      ("Sent from", "Becomes <code>${adminPrompt}</code> inside the §3.1 wrapper at runtime")])
label("Default persona prompt (seed)")
prompt(DEFAULT_PERSONA)

# ---- Appendix ----
H.append('<div class="pb"></div>')
h(2, "Appendix · Models, caching & overrides", "appendix")
p("<b>Runtime model &amp; tokens.</b> The candidate-facing chat endpoint reads "
  "<code>RECRUIT_CLAUDE_MODEL</code> (default <code>claude-sonnet-4-20250514</code>) and "
  "<code>RECRUIT_MAX_TOKENS</code> (default <code>1500</code>). Builder calls pin their models "
  "in code (<code>claude-opus-4-7</code> live; the dormant SSR generator mirror targets "
  "<code>claude-sonnet-4-6</code>).")
p("<b>Prompt caching.</b> Every large, stable prefix is marked "
  "<code>cache_control: { type: \"ephemeral\" }</code> — the runtime system prompt, and the "
  "JD/role prefix shared by the criteria, task, and rubric builder calls. Cache reads cost "
  "~10% of input and don’t count against the per-minute input-token rate limit; the README "
  "notes this cuts repeat-call cost ~90% within the 5-minute window.")
p("<b>Transient-error handling.</b> The runtime chat retries 429/502/503/504/529 and "
  "<code>overloaded_error</code>/<code>rate_limit_error</code> three times with 750/1500/3000 ms "
  "backoff before surfacing a candidate-friendly message.")
p("<b>Verbatim guarantee.</b> Every prompt block above is extracted directly from the source "
  f"files at commit <code>{esc(GIT_SHA)}</code> by "
  "<code>scripts/build_prompt_catalogue.py</code>; <code>${{...}}</code> markers indicate "
  "values interpolated at call time.")

document = ('<!doctype html><html><head><meta charset="utf-8">'
            f"<style>{CSS}</style></head><body>" + "".join(H) + "</body></html>")

os.makedirs(DOCS, exist_ok=True)
html_path = os.path.join(DOCS, "PROMPT_CATALOGUE.html")
pdf_path = os.path.join(DOCS, "PROMPT_CATALOGUE.pdf")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(document)

from weasyprint import HTML  # noqa: E402
HTML(string=document, base_url=ROOT).write_pdf(pdf_path)

print(f"Wrote {html_path}")
print(f"Wrote {pdf_path}")
print("\nExtracted prompt sizes (chars):")
for name, val in [
    ("title.sys", TITLE_SYS), ("criteria.sys", CRITERIA_SYS), ("task.sys", TASK_SYS),
    ("rubric.sys", RUBRIC_SYS), ("default_memo", DEFAULT_MEMO), ("fam1", FAM1), ("fam2+", FAM2),
    ("aplo1", APLO1), ("aplo2+", APLO2), ("cso1", CSO1), ("cso2+", CSO2),
    ("persona_wrapper", PERSONA_WRAPPER), ("default_persona", DEFAULT_PERSONA),
]:
    print(f"  {name:18} {len(val):>6}")
