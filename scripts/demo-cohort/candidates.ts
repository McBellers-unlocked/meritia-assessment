/**
 * Authored content for the seven seeded demo candidates (+ three spare
 * invites). Consumed by scripts/seed-demo-cohort.ts.
 *
 * Design (see the candidate matrix in the seed script header):
 *   A Aisha Rahman    — star: heavy, disciplined AI use; clean; 88
 *   B Ben Hartley     — solid: moderate AI use; minimal visible-output reuse; 71
 *   C Chloe Nakamura  — heaviest AI use, weak synthesis; clean; UNMARKED
 *   D Diego Ferrara   — 2 focus changes, small paste, moderate output reuse; 58
 *   E Elif Demir      — paste into chat and over-promises; 55
 *   F Felix Grant     — 2,850 pasted characters, 10.5 min away from the tab,
 *                       near-zero AI use, generic memo); UNMARKED
 *   G Grace Osei      — disengaged (thin memo, substantial visible-output
 *                       reuse, never opened IM, long off-tab stretches); 24
 *
 * All timestamps are minutes after the candidate's startedAt. Memo HTML uses
 * DOMPurify-safe TipTap tags only. AI-sandbox content is markdown (GFM tables
 * render in the reviewer); chat content is plain text.
 */

import type { DemoCandidate, SpareCandidate } from "./scenario";

// ---------------------------------------------------------------------------
// A — Aisha Rahman (Candidate A) — the star
// ---------------------------------------------------------------------------

const A_MEMO = `<h3>Briefing note — Q2 People Pulse</h3>
<p><strong>To:</strong> Maya Lindqvist, People Director<br><strong>From:</strong> Aisha Rahman, People &amp; Culture Advisor</p>
<p><strong>Headline: the Q2 pulse is not steady.</strong> The group score of 7.4 is arithmetically true and materially misleading. It is the weighted average of five functions that held or improved (about 8.1 combined) and one — Customer Operations, a third of our headcount — that has fallen from 8.1 to 5.9 in a single quarter. If the executive reads 7.4 tomorrow as "above target, near sector median", we will have missed the quarter's only real finding.</p>
<p><strong>What is driving it.</strong> The problem is concentrated, not general:</p>
<ul>
<li>Within Customer Operations, the night desk (140 staff) scores 4.7 against 6.5 for the day shift — and night-desk participation is 58%, so the true position is likely worse than measured, not better.</li>
<li>Attrition tells the same story from the other side. The 11.2% headline sits "in range", but 24 of Q2's 35 leavers are Customer Operations, 22 of 35 sit in the 1–3-year band, and CO leavers have risen every quarter this year (9 → 12 → 16 → 24).</li>
<li>Three exit interviews from three different night-desk leavers independently describe roster favouritism and shifts worsening after complaints. Eleven of the night desk's fifteen leavers were on a single roster group, whose weekend allocation moved to team-lead discretion in January. No formal grievance has been filed in twelve months — which, alongside "you learn to stop asking", I read as a warning sign rather than reassurance.</li>
</ul>
<p><strong>What I would do.</strong></p>
<ol>
<li><strong>This week:</strong> commission a confidential review of night-desk rostering, and return weekend/holiday allocation to transparent central rules while it runs. The roster-level pattern points at an identifiable individual, so it must be handled as a due-process management inquiry — with protection from rota retaliation for anyone who speaks — not as a conclusion we announce.</li>
<li><strong>This month:</strong> a targeted retention response for 1–3-year Customer Operations staff: stay conversations, and night-desk listening sessions run by someone outside the CO line. At roughly £4,800 recruitment cost and nine weeks to proficiency per agent, Q2's leavers alone are a six-figure problem.</li>
<li><strong>Next survey:</strong> close the measurement gap — night-desk participation and roster-level reporting — so a problem this size cannot sit behind a group average again.</li>
</ol>
<p>I have deliberately kept names out of this note; the underlying record is available to you on request. Happy to walk the executive through the decomposition tomorrow if useful.</p>`;

const A: DemoCandidate = {
  name: "Aisha Rahman",
  email: "aisha.rahman@halcyon-demo.example",
  startOffsetMin: 0,
  durationMin: 29,
  memoHtml: A_MEMO,
  sentAtMin: 27,
  chatOpenedAtMin: 3.1,
  offTabs: [],
  pastes: [],
  memoTrail: [
    {
      atMin: 1.5,
      actor: "candidate",
      content:
        "Before I read anything else — what exactly is the engagement index? Which items go into it, and how is the group figure calculated?",
    },
    {
      atMin: 1.7,
      actor: "ai",
      content: `The engagement index is a composite of six survey items, each scored 0–10:

1. Role clarity
2. Workload
3. Manager support
4. Fairness
5. Confidence in leadership
6. Advocacy

Function scores are simple means of respondents in that function. The group figure is the **headcount-weighted mean** of the function scores — larger functions move it more. Survey window was 2–13 June.`,
    },
    {
      atMin: 2.6,
      actor: "candidate",
      content: "Give me the per-function Q2 scores with Q1 comparatives and headcounts, as a table.",
    },
    {
      atMin: 2.8,
      actor: "ai",
      content: `| Function | Headcount | Q2 | Q1 | Change |
| --- | ---: | ---: | ---: | ---: |
| Customer Operations | 420 | 5.9 | 8.1 | −2.2 |
| Supply Chain & Logistics | 310 | 8.0 | 7.8 | +0.2 |
| Technology | 290 | 8.1 | 8.0 | +0.1 |
| Finance & Legal | 96 | 8.2 | 8.0 | +0.2 |
| Marketing & Digital | 84 | 8.1 | 8.2 | −0.1 |
| People & Workplace | 58 | 8.3 | 8.2 | +0.1 |
| **Group (weighted)** | **1,258** | **7.4** | **8.0** | **−0.6** |`,
    },
    {
      atMin: 6.0,
      actor: "candidate",
      content: "What does the group score look like if you exclude Customer Operations?",
    },
    {
      atMin: 6.2,
      actor: "ai",
      content:
        "Excluding Customer Operations, the weighted mean of the other five functions (838 staff) is approximately **8.1** in Q2, against approximately **7.9** in Q1.",
    },
    {
      atMin: 7.5,
      actor: "candidate",
      content: "Break Customer Operations down for me — is the fall uniform across shifts?",
    },
    {
      atMin: 7.7,
      actor: "ai",
      content: `Customer Operations by shift:

| Shift | Staff | Q2 | Q1 |
| --- | ---: | ---: | ---: |
| Day shift | 280 | 6.5 | 8.2 |
| Night desk | 140 | 4.7 | 7.9 |

Participation caveat: day shift responded at 81% (227 of 280); the night desk at **58%** (81 of 140). Scores for lower-participation groups carry wider uncertainty.`,
    },
    {
      atMin: 9.0,
      actor: "candidate",
      content: "Q2 leavers by function and by tenure, please.",
    },
    {
      atMin: 9.2,
      actor: "ai",
      content: `Q2 voluntary leavers — 35 total.

| Function | Leavers |
| --- | ---: |
| Customer Operations | 24 |
| Supply Chain & Logistics | 5 |
| Technology | 3 |
| Marketing & Digital | 2 |
| Finance & Legal | 1 |

| Tenure band | Leavers |
| --- | ---: |
| Under 1 year | 4 |
| 1–3 years | 22 |
| 3–7 years | 7 |
| 7+ years | 2 |

A Customer Operations shift split of the 24 is available on request.`,
    },
    {
      atMin: 10.5,
      actor: "candidate",
      content:
        "Yes please — and within Customer Operations' 24, anything on shift, team or roster concentration?",
    },
    {
      atMin: 10.7,
      actor: "ai",
      content: `Customer Operations' 24 Q2 leavers: day shift 9, night desk 15.

The night desk (140 staff) runs three roster groups:

| Roster | Staff | Team lead | Q2 leavers |
| --- | ---: | --- | ---: |
| A | 47 | M. Duran | 2 |
| B | 47 | J. Whelan | 2 |
| C | 46 | R. Calloway | 11 |

Roster C's 11 leavers represent a ~24% quarterly loss for that group. Policy note, from the rostering log: weekend and holiday allocation for the night desk moved from central scheduling to team-lead discretion in January. This is attrition and policy data from the HR system — it is not a finding about any individual.`,
    },
    {
      atMin: 12.5,
      actor: "candidate",
      content:
        "Show me every exit-interview extract that mentions scheduling or rosters, and tell me whether they come from different people.",
    },
    {
      atMin: 12.7,
      actor: "ai",
      content: `Three extracts mention scheduling or rosters, and they are from three different leavers:

1. "The job itself was fine. What wore me down was the roster. If you were in favour you got the weekends you asked for; if you weren't, you didn't. Everyone on nights knows exactly what I mean." — agent, night desk, 2 yrs
2. "I asked twice to come off the night rotation. Both times my shifts got worse the month after. You learn to stop asking." — senior agent, Customer Operations, 3 yrs
3. "Weekend and holiday allocation on the night desk depends on who the team lead likes that month. The survey never asks about that." — agent, night desk, 18 months

Coded themes across the nine Customer Operations exit interviews (multi-coding allowed): scheduling fairness 7; management style 6; workload 3; pay 2.`,
    },
    {
      atMin: 15.0,
      actor: "candidate",
      content:
        "Two quick things: have any formal grievances come from the night desk in the last 12 months, and what does replacing a contact-centre agent cost us?",
    },
    {
      atMin: 15.2,
      actor: "ai",
      content: `No formal grievances have been filed by night-desk staff in the last 12 months (HR case system).

Cost reference, from People & Workplace working figures: average recruitment cost per contact-centre agent ~£4,800; average time to full proficiency ~9 weeks; fully-loaded agent cost ~£34,000/yr.`,
    },
    {
      atMin: 18.0,
      actor: "candidate",
      content: "I'm short on time — could you draft my opening paragraph? Just something to react to.",
    },
    {
      atMin: 18.2,
      actor: "ai",
      content:
        "I can't draft any part of the note — the writing is yours. I can pull any figure, run any breakdown, or explain any part of the materials so you can build the opening yourself. What would help?",
    },
  ],
  chatTrail: [
    {
      atMin: 3.3,
      actor: "candidate",
      content:
        "Hi Dana — fair ask, and I understand not wanting surprises. I can't share the note before Maya has it, though.",
    },
    {
      atMin: 3.4,
      actor: "ai",
      content: "Appreciate the straight answer. Can you at least tell me — is it bad?",
    },
    {
      atMin: 4.0,
      actor: "candidate",
      content:
        "It's an honest read of the data, and your area features. What I can do: walk you through the whole thing right after Maya's seen it — and if it helps now, I'll verify my Customer Ops figures with you, numbers only.",
    },
    {
      atMin: 4.1,
      actor: "ai",
      content: "Deal — the numbers check I'll take, and the walk-through after. Thanks for not fobbing me off.",
    },
    {
      atMin: 5.2,
      actor: "candidate",
      content: "I'll send a time as soon as exec wraps. Thanks Dana.",
    },
    {
      atMin: 5.3,
      actor: "ai",
      content: "Good luck with it.",
    },
  ],
  marks: {
    score: 88,
    comments:
      "Excellent. Decomposed the average unprompted, found the shift and roster concentration, connected the verbatims to the leaver record, and treated the named-individual dimension with proper due-process care. Recommendations are specific, sequenced and costed. The IM handling was a model: held the line warmly and offered a legitimate alternative. A shade long in the middle section; the measurement-gap point could be one line shorter.",
    issueIds: ["average_masks_split", "attrition_concentration", "manager_verbatims"],
  },
  story: "Star — rich, disciplined Knowledge System dialogue, no focus changes or paste events, all 3 issues, model chat handling",
};

// ---------------------------------------------------------------------------
// B — Ben Hartley (Candidate B) — solid, one layer short
// ---------------------------------------------------------------------------

const B_MEMO = `<h3>Briefing note: Q2 People Pulse</h3>
<p><strong>For:</strong> Maya Lindqvist &nbsp;|&nbsp; <strong>From:</strong> Ben Hartley</p>
<p><strong>The headline is hiding the story.</strong> Group engagement of 7.4 looks acceptable against target, but it only holds because five functions improved slightly while Customer Operations — our largest function at 420 people — dropped from 8.1 to 5.9 in one quarter. Nothing else moved more than 0.2. The executive should treat this as a Customer Operations problem, not a group wobble.</p>
<p><strong>Attrition points the same way.</strong> 24 of the quarter's 35 voluntary leavers were Customer Operations, and 22 of the 35 had 1–3 years' tenure — we are losing trained, productive people, not new joiners who didn't settle. Item-level data shows the damage is concentrated in fairness (4.1 vs 7.8 group-wide) and manager support (4.9 vs 7.9).</p>
<p><strong>Recommended actions:</strong></p>
<ul>
<li>A focused review of Customer Operations working practices this month, starting with the January rostering change — the only structural change on record this year — and whether it is being applied consistently.</li>
<li>Listening sessions with Customer Operations teams, run by People &amp; Culture rather than the CO line, with the fairness and manager-support items as the agenda.</li>
<li>Targeted stay conversations for 1–3-year CO staff before we lose more of the mid-tenure core.</li>
</ul>
<p>Happy to discuss before the meeting.</p>`;

const B: DemoCandidate = {
  name: "Ben Hartley",
  email: "ben.hartley@halcyon-demo.example",
  startOffsetMin: 45,
  durationMin: 26,
  memoHtml: B_MEMO,
  sentAtMin: 24,
  chatOpenedAtMin: 3.1,
  offTabs: [],
  pastes: [],
  memoTrail: [
    {
      atMin: 2.0,
      actor: "candidate",
      content: "Can I see engagement by function, with the Q1 comparison?",
    },
    {
      atMin: 2.2,
      actor: "ai",
      content: `| Function | Headcount | Q2 | Q1 |
| --- | ---: | ---: | ---: |
| Customer Operations | 420 | 5.9 | 8.1 |
| Supply Chain & Logistics | 310 | 8.0 | 7.8 |
| Technology | 290 | 8.1 | 8.0 |
| Finance & Legal | 96 | 8.2 | 8.0 |
| Marketing & Digital | 84 | 8.1 | 8.2 |
| People & Workplace | 58 | 8.3 | 8.2 |
| **Group (weighted)** | **1,258** | **7.4** | **8.0** |`,
    },
    {
      atMin: 4.5,
      actor: "candidate",
      content: "And Q2 leavers — by function and by tenure?",
    },
    {
      atMin: 4.7,
      actor: "ai",
      content: `35 voluntary leavers in Q2.

By function: Customer Operations 24; Supply Chain & Logistics 5; Technology 3; Marketing & Digital 2; Finance & Legal 1.

By tenure: under 1 yr 4; 1–3 yrs 22; 3–7 yrs 7; 7+ yrs 2.`,
    },
    {
      atMin: 7.0,
      actor: "candidate",
      content: "Which survey items dropped most in Customer Operations?",
    },
    {
      atMin: 7.2,
      actor: "ai",
      content:
        "Item-level data shows the damage is concentrated in fairness (4.1 vs 7.8 group-wide) and manager support (4.9 vs 7.9). The other four items sit 0.5–1.0 below group.",
    },
    {
      atMin: 10.0,
      actor: "candidate",
      content: "Where does the 7.2 sector median come from? Is it comparable?",
    },
    {
      atMin: 10.2,
      actor: "ai",
      content:
        "It is drawn from Meridian Benchmarks' Consumer & Retail Panel — a subscription panel of roughly 2,400 companies. It is an external, group-level benchmark; the materials contain no function-level benchmark.",
    },
    {
      atMin: 13.0,
      actor: "candidate",
      content: "Did anything change in Customer Operations this year — policy, structure, leadership?",
    },
    {
      atMin: 13.2,
      actor: "ai",
      content:
        "One change is on record: in January, weekend and holiday allocation for the night desk moved from central scheduling to team-lead discretion (rostering policy log). No other structural, policy or leadership changes for Customer Operations appear in the materials.",
    },
  ],
  chatTrail: [
    {
      atMin: 3.2,
      actor: "candidate",
      content:
        "Hi Dana — honest answer: it's still in progress, and your area does feature. Engagement there has dropped this quarter.",
    },
    {
      atMin: 3.3,
      actor: "ai",
      content:
        "Dropped how much? Look — I'd rather fix things than be surprised. Just send me the section on us when it's drafted.",
    },
    {
      atMin: 3.9,
      actor: "candidate",
      content: "I'll send you your team's section once it's drafted — before exec if I can.",
    },
    {
      atMin: 4.0,
      actor: "ai",
      content: "Appreciated. That's all I'm asking.",
    },
  ],
  marks: {
    score: 71,
    comments:
      "Sound decomposition — caught the function collapse behind the 7.4 and the attrition concentration, grounded both in item-level data, and found the January rostering change. Stops one layer short: never pursued the shift or roster cuts, so the verbatim pattern went unconnected and the recommendation stays at listening-session altitude. Note the IM exchange: offered the Head of Ops her section before the Director had seen it — worth a coaching conversation about pre-briefing.",
    issueIds: ["average_masks_split", "attrition_concentration"],
  },
  story: "Solid — 2 of 3 issues, moderate Knowledge System dialogue, minimal visible-output overlap, no focus changes or paste events, but promised Dana her section pre-exec",
};

// ---------------------------------------------------------------------------
// C — Chloe Nakamura (Candidate C) — heaviest AI use, weak synthesis. UNMARKED.
// ---------------------------------------------------------------------------

const C_MEMO = `<h3>Q2 People Pulse — briefing note</h3>
<p><strong>To:</strong> Maya Lindqvist</p>
<p>Observations from the Q2 data, in the order I found them:</p>
<ul>
<li>Group engagement is 7.4, down from 8.0 in Q1, though still above the 7.0 target and near the sector median (7.2). Participation was 82%, up 3 points.</li>
<li>Customer Operations scored 5.9 (down from 8.1). Other functions were broadly flat or slightly up.</li>
<li>Within Customer Operations, the day shift scored 6.5 and the night desk 4.7. Night-desk participation was only 58%, which the methodology notes say means wider uncertainty.</li>
<li>Fairness (4.1) and manager support (4.9) are the weakest items in Customer Operations. Night-desk fairness alone is 3.2.</li>
<li>There were 35 voluntary leavers; 24 from Customer Operations; 22 of the 35 had 1–3 years' tenure.</li>
<li>Of the night desk's 15 leavers, 11 were on one roster group (Roster C, ~24% quarterly loss). Weekend allocation moved to team-lead discretion in January. Three exit interviews mention roster fairness.</li>
<li>Replacing an agent costs about £4,800 plus nine weeks to proficiency, so the leaver numbers have a real cost attached.</li>
</ul>
<p><strong>Suggested next steps:</strong> further investigation into the Customer Operations results, a deeper dive on the night-desk data next quarter, and possibly a focus group to understand the fairness scores. I can prepare a fuller analysis after the executive meeting if useful.</p>`;

const C: DemoCandidate = {
  name: "Chloe Nakamura",
  email: "chloe.nakamura@halcyon-demo.example",
  startOffsetMin: 150,
  durationMin: 27,
  memoHtml: C_MEMO,
  sentAtMin: 25,
  chatOpenedAtMin: 3.2,
  offTabs: [],
  pastes: [],
  memoTrail: [
    { atMin: 1.2, actor: "candidate", content: "what was the participation rate" },
    {
      atMin: 1.4,
      actor: "ai",
      content:
        "Group participation was 82% — 1,032 of 1,258 staff — up 3 points on Q1. Function and shift-level participation is available on request.",
    },
    { atMin: 2.2, actor: "candidate", content: "what is the engagement index exactly" },
    {
      atMin: 2.4,
      actor: "ai",
      content:
        "A composite of six items scored 0–10: role clarity, workload, manager support, fairness, confidence in leadership, advocacy. Function scores are means of respondents in that function; the group figure is the headcount-weighted mean of function scores.",
    },
    { atMin: 3.8, actor: "candidate", content: "show me all the exit interview quotes" },
    {
      atMin: 4.0,
      actor: "ai",
      content:
        "The six extracts on the exhibit are the full free-text sample released for this exercise (12 of 35 leavers completed an interview; the six extracts are a non-random sample of that record). There are no further verbatims to release. Coded themes across the nine Customer Operations interviews are available on request.",
    },
    { atMin: 5.0, actor: "candidate", content: "leavers by function?" },
    {
      atMin: 5.2,
      actor: "ai",
      content:
        "Q2 voluntary leavers by function: Customer Operations 24; Supply Chain & Logistics 5; Technology 3; Marketing & Digital 2; Finance & Legal 1. Total 35.",
    },
    { atMin: 6.3, actor: "candidate", content: "which functions improved this quarter" },
    {
      atMin: 6.5,
      actor: "ai",
      content:
        "Four functions improved on Q1: Supply Chain & Logistics (+0.2), Technology (+0.1), Finance & Legal (+0.2), People & Workplace (+0.1). Marketing & Digital slipped 0.1. Customer Operations fell 2.2.",
    },
    { atMin: 8.0, actor: "candidate", content: "is 5.9 bad compared to other companies?" },
    {
      atMin: 8.2,
      actor: "ai",
      content:
        "The materials contain one external comparator: a group-level sector median of 7.2 (Meridian Benchmarks, Consumer & Retail Panel). There is no function-level benchmark in the materials, so no direct external comparison for a single function's 5.9 is available.",
    },
    { atMin: 9.5, actor: "candidate", content: "why did customer operations drop so much" },
    {
      atMin: 9.7,
      actor: "ai",
      content:
        "That interpretation is yours to make — I can't attribute a cause. I can give you the cuts that bear on it: the shift split, item-level scores, the leaver record, the roster-level data, and the exit-interview themes. Which would you like?",
    },
    { atMin: 11.0, actor: "candidate", content: "ok show me the shift split" },
    {
      atMin: 11.2,
      actor: "ai",
      content:
        "Customer Operations, Q2: day shift (280 staff) 6.5, down from 8.2; night desk (140 staff) 4.7, down from 7.9. Participation: day 81%, night desk 58% — the night-desk score carries wider uncertainty.",
    },
    { atMin: 12.8, actor: "candidate", content: "which items dropped most there" },
    {
      atMin: 13.0,
      actor: "ai",
      content:
        "In Customer Operations: fairness 4.1 (group 7.8) and manager support 4.9 (group 7.9) show the largest gaps. On the night desk alone, fairness is 3.2.",
    },
    { atMin: 14.5, actor: "candidate", content: "are there team level cuts of the night desk" },
    {
      atMin: 14.7,
      actor: "ai",
      content: `Yes — the night desk's three roster groups:

| Roster | Staff | Team lead | Q2 leavers |
| --- | ---: | --- | ---: |
| A | 47 | M. Duran | 2 |
| B | 47 | J. Whelan | 2 |
| C | 46 | R. Calloway | 11 |

Policy note: weekend and holiday allocation moved from central scheduling to team-lead discretion in January. This is attrition and policy data, not a finding about any individual.`,
    },
    { atMin: 16.2, actor: "candidate", content: "what should I recommend to Maya?" },
    {
      atMin: 16.4,
      actor: "ai",
      content:
        "I can't recommend — the conclusions are yours. I can pull anything that would help you decide: costs, comparators, any breakdown of the survey or leaver data. What would be useful?",
    },
    { atMin: 18.0, actor: "candidate", content: "what does it cost to replace an agent" },
    {
      atMin: 18.2,
      actor: "ai",
      content:
        "People & Workplace working figures: ~£4,800 average recruitment cost per contact-centre agent, ~9 weeks to full proficiency, fully-loaded agent cost ~£34,000/yr.",
    },
    { atMin: 20.5, actor: "candidate", content: "summarise all the important facts about customer operations" },
    {
      atMin: 20.7,
      actor: "ai",
      content:
        "Selecting which facts are important is a judgement I'll leave with you, but here is a neutral compilation of the Customer Operations record: Q2 engagement 5.9 (Q1 8.1); day shift 6.5, night desk 4.7; night-desk participation 58%; weakest items fairness 4.1 and manager support 4.9 (night-desk fairness 3.2); 24 of the group's 35 Q2 voluntary leavers, 15 of them night desk, 11 of those on Roster C (46 staff); rostering moved to team-lead discretion in January; scheduling fairness coded in 7 of 9 exit interviews; no formal grievances in 12 months.",
    },
  ],
  chatTrail: [
    {
      atMin: 3.6,
      actor: "candidate",
      content: "Hi Dana — I'm mid-analysis, can I come back to you?",
    },
    {
      atMin: 3.7,
      actor: "ai",
      content: "Sure — before end of day though, please. I don't want surprises at exec tomorrow.",
    },
  ],
  marks: null,
  story: "Heaviest AI use (13 asks), surfaced everything incl. Roster C — but the note is a list, not an argument. Live-mark me",
};

// ---------------------------------------------------------------------------
// D — Diego Ferrara (Candidate D) — some focus changes and paste activity, misses the average trap
// ---------------------------------------------------------------------------

const D_MEMO = `<h3>Briefing note — Q2 People Pulse</h3>
<p><strong>To:</strong> Maya Lindqvist, People Director</p>
<p><strong>Overall position.</strong> Group engagement remains above target at 7.4 (target 7.0, sector median 7.2) with participation up at 82%. The quarter's real issue is retention in Customer Operations.</p>
<p><strong>The retention problem.</strong> Of 35 voluntary leavers this quarter, 24 came from Customer Operations, and 22 of the 35 had one to three years' tenure — trained people at their most productive, not early-tenure churn. The trailing attrition rate of 11.2% sits inside the sector range, but a range comparison at group level says nothing about a concentration like this. The exit-interview extracts include several unprompted references to rostering and shift allocation in the contact centres, which deserve follow-up.</p>
<p><strong>Recommended actions:</strong></p>
<ul>
<li>Commission a focused retention review for Customer Operations this month, covering rostering practice, shift allocation and line management in the contact centres.</li>
<li>Expand exit-interview coverage (only 12 of 35 leavers were interviewed) so decisions rest on more than a one-third sample.</li>
<li>Introduce stay conversations for 1–3-year Customer Operations staff, prioritised by team.</li>
</ul>
<p>Backfilling this quarter's Customer Operations leavers alone will cost on the order of £115k in recruitment and lost proficiency, which justifies a properly resourced response.</p>`;

const D: DemoCandidate = {
  name: "Diego Ferrara",
  email: "diego.ferrara@halcyon-demo.example",
  startOffsetMin: 210,
  durationMin: 29,
  memoHtml: D_MEMO,
  sentAtMin: 27,
  chatOpenedAtMin: 3.1,
  offTabs: [
    { atMin: 9, offTabSec: 45 },
    { atMin: 17, offTabSec: 90 },
  ],
  pastes: [{ atMin: 21, target: "memo", charCount: 220, taskNumber: 1 }],
  memoTrail: [
    { atMin: 2.5, actor: "candidate", content: "Show me engagement by function for Q2 and Q1." },
    {
      atMin: 2.7,
      actor: "ai",
      content: `| Function | Q2 | Q1 |
| --- | ---: | ---: |
| Customer Operations | 5.9 | 8.1 |
| Supply Chain & Logistics | 8.0 | 7.8 |
| Technology | 8.1 | 8.0 |
| Finance & Legal | 8.2 | 8.0 |
| Marketing & Digital | 8.1 | 8.2 |
| People & Workplace | 8.3 | 8.2 |
| **Group (weighted)** | **7.4** | **8.0** |`,
    },
    { atMin: 5.0, actor: "candidate", content: "Leavers by function this quarter?" },
    {
      atMin: 5.2,
      actor: "ai",
      content:
        "Q2 voluntary leavers: Customer Operations 24; Supply Chain & Logistics 5; Technology 3; Marketing & Digital 2; Finance & Legal 1. Total 35.",
    },
    { atMin: 7.5, actor: "candidate", content: "And by tenure?" },
    {
      atMin: 7.7,
      actor: "ai",
      content: "By tenure at leaving: under 1 year 4; 1–3 years 22; 3–7 years 7; 7+ years 2.",
    },
    {
      atMin: 11.0,
      actor: "candidate",
      content: "Why is 11.2% described as in line with the sector? Where does that come from?",
    },
    {
      atMin: 11.2,
      actor: "ai",
      content:
        "11.2% is the group's annualised voluntary attrition over the trailing 12 months (141 leavers against 1,258 staff). The sector range of 11–13% comes from Meridian Benchmarks' Consumer & Retail Panel and is a group-level comparison; the exhibit applies it group-wide. The trailing attrition rate of 11.2% sits inside the sector range, but a range comparison at group level says nothing about a concentration like this.",
    },
    { atMin: 15.0, actor: "candidate", content: "Show me the exit-interview extracts." },
    {
      atMin: 15.2,
      actor: "ai",
      content:
        "Six extracts are on the exhibit — three reference rostering or shift allocation on the Customer Operations night desk (from three different leavers), one cites pay (Supply Chain), one relocation (Marketing), one general night-shift fatigue (Customer Operations). The exit-interview extracts include several unprompted references to rostering and shift allocation in the contact centres, which deserve follow-up. 12 of 35 leavers completed an interview; the extracts are a non-random sample.",
    },
    { atMin: 19.0, actor: "candidate", content: "Does the pulse run every quarter? When was this window?" },
    {
      atMin: 19.2,
      actor: "ai",
      content: "Yes — quarterly. The Q2 window was 2–13 June.",
    },
  ],
  chatTrail: [
    {
      atMin: 3.4,
      actor: "candidate",
      content: "Hi Dana — I can give you the headlines right after it goes to Maya, not before. Hope that's fair.",
    },
    {
      atMin: 3.5,
      actor: "ai",
      content: "Nine years here and I still get told to wait for the minutes… fine. Should I be worried?",
    },
    {
      atMin: 4.2,
      actor: "candidate",
      content: "Attrition in your area is running hot — you'll know that better than me. Detail straight after exec, I promise.",
    },
    {
      atMin: 4.3,
      actor: "ai",
      content: "That I do know. OK — after exec, then. Good luck with it.",
    },
  ],
  marks: {
    score: 58,
    comments:
      "Correctly isolates the attrition concentration, reads the tenure profile well and costs the problem — but accepts the headline engagement figure at face value, so the function collapse behind the 7.4 goes unexamined and the note opens by reassuring the executive. Two brief tab-aways and one small paste; nothing conclusive, noted for completeness. Chat handling was reasonable: deferred detail without stonewalling, though 'running hot' gave away more than needed pre-exec.",
    issueIds: ["attrition_concentration"],
  },
  story: "Two short focus changes, a 220-character paste and moderate visible-output overlap — found attrition, missed the averaging trap",
};

// ---------------------------------------------------------------------------
// E — Elif Demir (Candidate E) — paste activity and an over-promise to Dana
// ---------------------------------------------------------------------------

const E_MEMO = `<h3>Briefing note — Q2 People Pulse</h3>
<p><strong>To:</strong> Maya Lindqvist</p>
<p><strong>The 7.4 is doing a lot of work.</strong> Group engagement of 7.4 looks steady — above target, near the sector median — but it is an average that conceals its own story. Excluding Customer Operations, the rest of the group scores about 8.1 and actually improved on Q1. Customer Operations itself has fallen from 8.1 to 5.9. In other words: the group did not dip slightly; one function fell sharply and the average absorbed it. If the executive takes one thing from tomorrow, it should be that.</p>
<p><strong>Also worth noting:</strong> voluntary attrition (11.2% annualised) is inside the sector range, and this quarter's 35 leavers include a number from Customer Operations, which fits the engagement picture. Participation was healthy at 82%.</p>
<p><strong>Suggested actions:</strong></p>
<ul>
<li>A structured deep-dive into the Customer Operations results before any group-wide narrative is agreed.</li>
<li>Action planning with Customer Operations leadership once the deep-dive reports.</li>
<li>Re-run a short pulse in that function next quarter to confirm direction.</li>
</ul>
<p>I can have the deep-dive scoped by Friday.</p>`;

const E: DemoCandidate = {
  name: "Elif Demir",
  email: "elif.demir@halcyon-demo.example",
  startOffsetMin: 285,
  durationMin: 24,
  memoHtml: E_MEMO,
  sentAtMin: 22,
  chatOpenedAtMin: 3.3,
  offTabs: [{ atMin: 11, offTabSec: 120 }],
  pastes: [{ atMin: 14.2, target: "chat", charCount: 143, taskNumber: 2 }],
  memoTrail: [
    { atMin: 2.0, actor: "candidate", content: "Per-function engagement scores for Q2, please." },
    {
      atMin: 2.2,
      actor: "ai",
      content:
        "Q2 scores: Customer Operations 5.9; Supply Chain & Logistics 8.0; Technology 8.1; Finance & Legal 8.2; Marketing & Digital 8.1; People & Workplace 8.3. Group (headcount-weighted) 7.4. Q1 comparatives are available on request.",
    },
    { atMin: 4.0, actor: "candidate", content: "What's the group score excluding Customer Operations?" },
    {
      atMin: 4.2,
      actor: "ai",
      content:
        "Excluding Customer Operations, the weighted mean of the other five functions is approximately 8.1 in Q2, against approximately 7.9 in Q1.",
    },
    { atMin: 6.5, actor: "candidate", content: "What was participation?" },
    {
      atMin: 6.7,
      actor: "ai",
      content: "82% — 1,032 of 1,258 staff, up 3 points on Q1. Function and shift-level participation is available on request.",
    },
    { atMin: 9.0, actor: "candidate", content: "Where's the sector median from?" },
    {
      atMin: 9.2,
      actor: "ai",
      content:
        "Meridian Benchmarks — Consumer & Retail Panel, a subscription panel of roughly 2,400 companies. Group-level comparison; no function-level benchmark is in the materials.",
    },
  ],
  chatTrail: [
    {
      atMin: 14.2,
      actor: "candidate",
      content:
        "Thanks for reaching out! I'm currently heads-down on a deliverable but will circle back as soon as I have bandwidth — appreciate your patience!",
    },
    {
      atMin: 14.3,
      actor: "ai",
      content: "…that reads like an out-of-office. Is that a no on the preview?",
    },
    {
      atMin: 15.1,
      actor: "candidate",
      content: "Sorry — no, you're fine. I can share the draft with you tonight before it goes anywhere.",
    },
    {
      atMin: 15.2,
      actor: "ai",
      content: "Tonight works. Ping it over when it's ready.",
    },
    { atMin: 15.8, actor: "candidate", content: "Will do." },
    { atMin: 15.9, actor: "ai", content: "Thanks — good luck with Maya." },
  ],
  marks: {
    score: 55,
    comments:
      "Found the averaging problem quickly — one of the few who tested the headline — and the opening paragraph is genuinely sharp. But the note stops there: the leaver record is waved at rather than analysed, nothing below function level was pursued, and the actions are process boilerplate. Chat handling poor: an 11-minute silence, then a pasted canned deflection, then a promise to send the Head of Operations the full draft before the Director had seen it.",
    issueIds: ["average_masks_split"],
  },
  story: "Pasted a canned line into the IM, then promised Dana the draft tonight",
};

// ---------------------------------------------------------------------------
// F — Felix Grant (Candidate F) — the "wrote it elsewhere" story. UNMARKED.
// ---------------------------------------------------------------------------

const F_MEMO = `<h3>Briefing Note: Q2 Employee Engagement Review</h3>
<p><strong>Prepared for:</strong> Maya Lindqvist, People Director</p>
<p><strong>Executive summary.</strong> Employee engagement remains a critical strategic priority and a key driver of organisational performance, retention and customer outcomes. The Q2 results indicate a broadly stable engagement picture across the organisation, with headline engagement above internal targets and participation demonstrating a healthy response culture. At the same time, the results highlight opportunities to strengthen our listening infrastructure and continue building a high-performance, people-first culture. It is recommended that the organisation adopt a structured, multi-quarter engagement roadmap to convert these insights into sustained improvement.</p>
<p><strong>Key observations.</strong> Engagement outcomes of this kind typically reflect a combination of leadership visibility, career development opportunity, workload sustainability and recognition. While individual scores will always vary across teams and functions, the overall trajectory underlines the importance of sustained investment in the employee experience and of embedding engagement into everyday management practice rather than treating it as an annual event.</p>
<p><strong>Benchmarking.</strong> Best-practice organisations increasingly treat engagement as a leading indicator alongside customer and commercial metrics, and leading employers are moving toward integrated people-analytics capabilities that connect sentiment, retention and performance data into a single view. Aligning our approach with this direction of travel will strengthen the credibility of the people agenda at executive level and position the function as a strategic partner to the business.</p>
<p><strong>Recommendations.</strong> I recommend a three-pillar response:</p>
<ol>
<li><strong>Listening strategy.</strong> Evolve from periodic surveys to an always-on listening approach, combining pulse surveys, focus groups and manager-led conversations, to surface issues earlier and demonstrate that feedback leads to action.</li>
<li><strong>Manager enablement.</strong> Equip line managers with a practical toolkit — conversation guides, team action-planning templates and dashboard access — recognising that the manager relationship is the single biggest influence on the employee experience.</li>
<li><strong>Recognition and wellbeing.</strong> Refresh the recognition programme and reinforce wellbeing support, ensuring both are visible, inclusive and consistently applied across all working patterns.</li>
</ol>
<p><strong>Next steps.</strong> Subject to your direction, I will develop a detailed action plan with owners and milestones, socialise it with functional leadership, and establish a quarterly review cadence so the executive can track progress against agreed engagement KPIs. In parallel, I would suggest a short communications plan so that colleagues see a clear "you said, we did" narrative emerging from this survey cycle, which the evidence consistently shows is the single biggest driver of future participation.</p>
<p>I look forward to discussing at the executive meeting.</p>`;

const F: DemoCandidate = {
  name: "Felix Grant",
  email: "felix.grant@halcyon-demo.example",
  startOffsetMin: 330,
  durationMin: 19,
  memoHtml: F_MEMO,
  sentAtMin: 18,
  chatOpenedAtMin: 3.2,
  offTabs: [
    { atMin: 4, offTabSec: 40 },
    { atMin: 5.5, offTabSec: 55 },
    { atMin: 7, offTabSec: 200 },
    { atMin: 10.5, offTabSec: 130 },
    { atMin: 13, offTabSec: 95 },
    { atMin: 14.8, offTabSec: 60 },
    { atMin: 15.9, offTabSec: 50 },
  ],
  pastes: [{ atMin: 17, target: "memo", charCount: 2850, taskNumber: 1 }],
  memoTrail: [
    {
      atMin: 2.0,
      actor: "candidate",
      content: "Can you give me the key takeaways from the survey data for my briefing note?",
    },
    {
      atMin: 2.2,
      actor: "ai",
      content:
        "Selecting takeaways for the note is analysis I can't do for you — the conclusions are yours. I can pull any figure or run any breakdown: per-function scores, the leaver record, shift or roster-level cuts, the exit-interview file. What would help?",
    },
  ],
  chatTrail: [],
  marks: null,
  story: "The 'wrote it elsewhere' case — 2,850-char paste, 7 tab-aways (~10.5 min), 1 AI msg, generic memo. Live-mark me",
};

// ---------------------------------------------------------------------------
// G — Grace Osei (Candidate G) — disengaged. Never opened the IM.
// ---------------------------------------------------------------------------

const G_MEMO = `<p>Maya —</p>
<p>Quick summary of the Q2 pulse ahead of tomorrow.</p>
<p>Engagement this quarter is 7.4, which is above our target of 7.0 and close to the sector median of 7.2. Participation was strong at 82%, up on last quarter. Voluntary attrition is 11.2% annualised, which is within the sector range of 11–13%. There were 35 voluntary leavers in the quarter.</p>
<p>Overall the picture is steady. Suggest we continue to monitor the trend and consider a deeper dive next quarter if scores move materially. Happy to pull anything further if the exec asks.</p>`;

const G: DemoCandidate = {
  name: "Grace Osei",
  email: "grace.osei@halcyon-demo.example",
  startOffsetMin: 405,
  durationMin: 28,
  memoHtml: G_MEMO,
  sentAtMin: null, // never pressed "send" — the overall submit captured the draft
  chatOpenedAtMin: null, // never opened the IM at all
  offTabs: [
    { atMin: 6, offTabSec: 240 },
    { atMin: 13, offTabSec: 180 },
    { atMin: 20, offTabSec: 150 },
  ],
  pastes: [],
  memoTrail: [
    { atMin: 3.0, actor: "candidate", content: "what's the overall engagement score this quarter" },
    {
      atMin: 3.2,
      actor: "ai",
      content:
        "Engagement this quarter is 7.4, which is above our target of 7.0 and close to the sector median of 7.2. Participation was strong at 82%, up on last quarter. Per-function breakdowns are available on request.",
    },
    { atMin: 11.0, actor: "candidate", content: "how many people left this quarter" },
    {
      atMin: 11.2,
      actor: "ai",
      content:
        "Voluntary attrition is 11.2% annualised, which is within the sector range of 11–13%. There were 35 voluntary leavers in the quarter. Breakdowns by function, tenure and shift are available on request.",
    },
  ],
  chatTrail: [],
  marks: {
    score: 24,
    comments:
      "Reads the three headline tiles and stops: no decomposition, no engagement with the leaver record or the exit interviews, and the note was never finalised — the submission captured a draft. Two shallow sandbox queries in 28 minutes, the live message from Operations was never opened, and there were three long off-tab stretches totalling nearly ten minutes. Little evidence of genuine engagement with the exercise.",
    issueIds: [],
  },
  story: "Disengaged — headline-only memo with substantial visible-output overlap (never sent), ignored the IM entirely, ~9.5 min off-tab",
};

// ---------------------------------------------------------------------------

export const DEMO_CANDIDATES: DemoCandidate[] = [A, B, C, D, E, F, G];

export const SPARE_CANDIDATES: SpareCandidate[] = [
  { name: "Harriet Vance", email: "harriet.vance@halcyon-demo.example" },
  { name: "Iain McAllister", email: "iain.mcallister@halcyon-demo.example" },
  { name: "Jia Lin", email: "jia.lin@halcyon-demo.example" },
];
