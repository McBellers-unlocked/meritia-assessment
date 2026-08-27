/**
 * Fictional, deliberately compact technical demo for a live walkthrough.
 * The dataset is synthetic and safe to send to managed code execution.
 */

export const SLUG = "demo-data-scientist-python";
export const TITLE = "Data Scientist — Model Risk Investigation";
export const ORGANISATION = "Aster Analytics Lab (Aster)";
export const POSITION_TITLE = "Data Scientist";
export const TOTAL_MINUTES = 20;
export const TOKEN_PREFIX = "DS";
export const COHORT_TITLE = "DEMO — Data Scientist Python Workbench (Aster)";
export const EXHIBIT_SOURCE_ID = "ASTER-CHURN-MODEL-PACK-V1";

export const TASK_TITLE = "Churn model — technical validation before deployment";
export const TASK_BRIEF = `**From:** Dr Lena Ortiz, Head of Data Science
**To:** {{name}}, Data Scientist
**Subject:** Churn model — technical sign-off before tomorrow's deployment
**Sent:** Thursday, 09:10

The Growth team wants to deploy model \`churn_v4\` tomorrow. The headline random-split ROC-AUC is 0.94, but the temporal holdout has fallen sharply and Customer Operations is worried that annual-contract customers are being missed.

Use the Aster Workbench and the supplied model pack to investigate. You may ask the AI to write and **run Python** against the fictional validation sample.

Produce a concise technical sign-off covering:

1. the checks you ran and the code/results that matter;
2. any leakage, validation-design or subgroup-performance concerns;
3. whether you would deploy, pause or limit the release; and
4. the smallest defensible remediation and re-validation plan.

I want an engineering decision I can act on—not a generic discussion of responsible AI.`;

export const DELIVERABLE_LABEL = "Technical model-validation note to the Head of Data Science";
export const DELIVERABLE_PLACEHOLDER =
  "Record the Python checks you ran, the observed results, the model risks you found, your deployment decision, and the minimum remediation/re-validation plan.";
export const EXHIBIT_TITLE = "Aster churn_v4 — model card, pipeline extract and temporal validation sample";

export const VALIDATION_CSV = `customer_id,contract_type,region,tenure_months,support_tickets_90d,days_since_login,retention_offer_accepted,churned,predicted_churn
M01,monthly,north,3,5,31,0,1,1
M02,monthly,south,7,4,24,0,1,1
M03,monthly,east,11,6,35,0,1,1
M04,monthly,west,2,3,28,0,1,1
M05,monthly,north,15,5,22,0,1,1
M06,monthly,west,5,2,19,0,1,0
M07,monthly,south,9,4,17,1,0,1
M08,monthly,east,18,1,4,1,0,0
M09,monthly,north,22,0,2,1,0,0
M10,monthly,west,13,2,7,1,0,0
M11,monthly,south,27,1,3,1,0,0
M12,monthly,east,31,0,1,1,0,0
A01,annual,north,14,5,29,0,1,1
A02,annual,south,20,4,26,0,1,1
A03,annual,east,25,3,23,0,1,1
A04,annual,west,16,4,21,0,1,0
A05,annual,north,29,2,18,0,1,0
A06,annual,west,33,3,16,0,1,0
A07,annual,south,19,3,14,1,0,1
A08,annual,east,38,1,5,1,0,0
A09,annual,north,41,0,3,1,0,0
A10,annual,west,47,1,6,1,0,0
A11,annual,south,52,0,2,1,0,0
A12,annual,east,60,0,1,1,0,0`;

export const EXHIBIT_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#172033;font:14px/1.5 Inter,Arial,sans-serif}.page{max-width:1050px;margin:auto;padding:28px}.hero{background:linear-gradient(135deg,#111b35,#173d5b);color:white;padding:24px;border-radius:16px;box-shadow:0 12px 30px #173d5b22}.eyebrow{font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#75e6d3}.hero h1{margin:7px 0 4px;font-size:27px}.hero p{margin:0;color:#d9e8f3}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.card{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:18px;box-shadow:0 4px 14px #1720330b}.card h2{font-size:16px;margin:0 0 10px;color:#173d5b}.metric{display:grid;grid-template-columns:1fr auto;gap:8px;border-bottom:1px solid #edf1f6;padding:7px 0}.metric:last-child{border:0}.bad{color:#b42318;font-weight:700}.warn{color:#a15c00;font-weight:700}.code{white-space:pre-wrap;background:#101827;color:#d8f6ef;border-radius:10px;padding:14px;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;overflow:auto}.wide{grid-column:1/-1}.note{border-left:4px solid #ef9f27;background:#fff8e8;padding:10px 12px;border-radius:6px}.tag{display:inline-block;border:1px solid #9fd8cd;background:#e8faf6;color:#0d6156;border-radius:999px;padding:3px 8px;font:700 10px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border:1px solid #dbe4ef;text-align:left}th{background:#edf4f8;color:#173d5b}footer{color:#64748b;font-size:11px;margin-top:16px}
@media(max-width:760px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.page{padding:14px}}
</style></head><body><main class="page">
<section class="hero"><div class="eyebrow">Technical validation pack · fictional data</div><h1>churn_v4 pre-deployment review</h1><p>Aster Growth Platform · binary churn prediction · decision threshold 0.50</p></section>
<section class="grid">
<article class="card"><h2>Model card snapshot</h2><div class="metric"><span>Training ROC-AUC</span><strong>0.96</strong></div><div class="metric"><span>Random-split validation ROC-AUC</span><strong>0.94</strong></div><div class="metric"><span>Temporal holdout ROC-AUC</span><span class="bad">0.68</span></div><div class="metric"><span>Temporal holdout recall</span><span class="warn">0.67</span></div><div class="metric"><span>Proposed release</span><strong>100% tomorrow</strong></div></article>
<article class="card"><h2>Top feature importance</h2><div class="metric"><span>retention_offer_accepted</span><span class="bad">0.46</span></div><div class="metric"><span>days_since_login</span><strong>0.19</strong></div><div class="metric"><span>support_tickets_90d</span><strong>0.13</strong></div><div class="metric"><span>tenure_months</span><strong>0.11</strong></div><div class="metric"><span>contract_type</span><strong>0.07</strong></div><p class="note"><strong>Data dictionary:</strong> <code>retention_offer_accepted</code> is populated after a risk score causes an offer to be sent and the customer responds. It is not known at scoring time.</p></article>
<article class="card wide"><h2>Training pipeline extract</h2><pre class="code">feature_cols = [
    "contract_type", "region", "tenure_months",
    "support_tickets_90d", "days_since_login",
    "retention_offer_accepted"
]

X_train, X_valid, y_train, y_valid = train_test_split(
    df[feature_cols], df["churned"],
    test_size=0.20, random_state=42, stratify=df["churned"]
)

# Rows from all observation months are mixed before the split.
model.fit(X_train, y_train)</pre></article>
<article class="card wide"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h2 style="margin:0">Temporal validation sample</h2><span class="tag">24 synthetic rows</span></div><p>Use this CSV in the managed Python sandbox. <code>churned</code> is ground truth; <code>predicted_churn</code> is the thresholded model output.</p><pre class="code">${VALIDATION_CSV}</pre></article>
<article class="card wide"><h2>Release note from Growth Engineering</h2><p>“The random-split metric exceeds the 0.90 target. Unless validation identifies a blocking defect, deploy globally and monitor aggregate precision weekly. We can tune subgroup thresholds after launch.”</p></article>
</section><footer>Aster Analytics Lab is fictional. Every row, person, metric and system in this pack was invented for assessment demonstration.</footer>
</main></body></html>`;

export const KNOWLEDGE_SYSTEM_PROMPT = `You are the Aster Data Science Workbench, a technical AI copilot available during a timed Data Scientist assessment. You have the fictional churn_v4 model card, pipeline extract, data dictionary, and 24-row temporal validation CSV supplied in the exhibit.

Your role is to collaborate technically. You may write, explain, debug and revise Python/pandas/scikit-learn code. When the candidate asks you to run or verify an analysis, use the managed code-execution tool rather than estimating the output. Work only with the fictional data in the exercise.

Key boundaries:
- Generated code is working material, not automatically correct. State assumptions and limitations.
- Separate directly observed calculations from interpretation and deployment judgement.
- You may draft code and a technical outline in Copilot Mode, but the candidate owns the final sign-off and must check your work.
- Never claim you executed code unless the managed tool actually returned a result.
- Do not fetch external data or imply that the 24-row sample establishes production fairness or statistical significance.

Useful technical facts from the supplied pack:
- retention_offer_accepted is populated only after scoring and customer response; it is unavailable at prediction time.
- The random split mixes observation months; the temporal holdout is the relevant forward-looking check.
- On the supplied thresholded sample the candidate can calculate confusion matrices, precision/recall, false-negative rates by contract_type, and simple sensitivity checks.
- A defensible remediation discussion may include removing post-outcome fields, defining an as-of timestamp, rebuilding features point-in-time, using time-based validation, reporting subgroup uncertainty, and controlled shadow/canary evaluation. Do not force a deployment recommendation; expose evidence and trade-offs.

When code is requested, keep it readable enough for an assessor to inspect. Prefer a self-contained Python snippet using io.StringIO for the supplied CSV, pandas for grouping, and scikit-learn metrics when useful.`;

export const TASK_RUBRIC = {
  technical_analysis: {
    max: 35,
    description: "Correct, reproducible Python analysis and interpretation of its output.",
    embedded_issues: [
      { id: "python_reproducibility", title: "Produces inspectable analysis code and reports observed output accurately", max_marks: 15, expected: "Uses the supplied CSV, computes a confusion matrix and subgroup false-negative rates, and distinguishes executed output from interpretation." },
      { id: "subgroup_fnr", title: "Identifies materially different false-negative rates by contract type", max_marks: 12, expected: "Monthly FNR 1/6 (16.7%); annual FNR 3/6 (50.0%), with an explicit small-sample caveat." },
      { id: "metric_reconciliation", title: "Reconciles sample-level recall with the reported temporal result", max_marks: 8, expected: "Overall TP=8, FN=4, recall=0.667; does not confuse random-split AUC with forward performance." },
    ],
  },
  model_risk: {
    max: 35,
    description: "Diagnosis of leakage and validation-design defects.",
    embedded_issues: [
      { id: "post_outcome_leakage", title: "Identifies retention_offer_accepted as post-outcome leakage", max_marks: 18, expected: "Explains that it is unavailable at scoring time and dominates importance, so offline performance is not deployable evidence." },
      { id: "random_split_leakage", title: "Rejects the mixed-month random split as the primary deployment gate", max_marks: 10, expected: "Requires point-in-time features and forward/temporal validation." },
      { id: "sample_limits", title: "Treats the 24-row sample as diagnostic, not conclusive", max_marks: 7, expected: "Calls for confidence intervals/larger holdout and avoids unsupported fairness claims." },
    ],
  },
  engineering_judgement: {
    max: 30,
    description: "A clear deployment decision and proportionate remediation plan.",
    indicators: [
      "Makes an explicit deploy/pause/limit decision grounded in the observed defects",
      "Defines an as-of feature contract and removes post-outcome fields",
      "Proposes temporal re-validation and subgroup monitoring before wider release",
      "Uses shadow or tightly controlled canary deployment only if risks and rollback criteria are explicit",
    ],
  },
};
