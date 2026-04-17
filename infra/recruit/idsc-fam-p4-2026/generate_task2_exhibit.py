"""
Generate the Task 2 AI cost-analytics exhibit for the IDSC FAM (P4) recruitment
assessment. Polished, confident, deliberately flawed in four specific ways
(see scenario brief for details).
"""

from __future__ import annotations

import base64
import io
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT_DIR = Path(__file__).parent

NAVY = "#1B2A4A"
ACCENT = "#4B92DB"
LIGHT = "#eef3f9"
GREEN_OK = "#2e7d32"


def fig_to_b64() -> str:
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=140, bbox_inches="tight", facecolor="white")
    plt.close()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")


def cost_recovery_chart() -> str:
    services = ["Managed\nInfrastructure", "Application\nHosting", "Cybersecurity", "Sovereign AI\nInfrastructure"]
    revenue = [42.3, 61.8, 38.2, 15.9]
    direct = [38.1, 54.2, 33.9, 8.2]
    x = np.arange(len(services))
    width = 0.36
    fig, ax = plt.subplots(figsize=(8.4, 4.4))
    ax.bar(x - width / 2, revenue, width, label="Revenue", color=NAVY)
    ax.bar(x + width / 2, direct, width, label="Direct cost (as reported)", color=ACCENT)
    for i, (r, d) in enumerate(zip(revenue, direct)):
        ax.text(i - width / 2, r + 1.0, f"${r:.1f}m", ha="center", fontsize=9, fontweight="bold", color=NAVY)
        ax.text(i + width / 2, d + 1.0, f"${d:.1f}m", ha="center", fontsize=9, fontweight="bold", color=ACCENT)
    ax.set_xticks(x); ax.set_xticklabels(services, fontsize=10)
    ax.set_ylabel("USD millions"); ax.set_ylim(0, 75)
    ax.set_title("Service Line Revenue vs Direct Cost (FY 20X5)", fontsize=12, pad=10, color=NAVY)
    ax.legend(loc="upper right")
    ax.grid(axis="y", alpha=0.25)
    return fig_to_b64()


def shared_alloc_chart() -> str:
    services = ["Managed\nInfrastructure", "Application\nHosting", "Cybersecurity", "Sovereign AI"]
    revenue_share = [42.3, 61.8, 38.2, 15.9]
    total_rev = sum(revenue_share)
    pct = [r / total_rev * 100 for r in revenue_share]
    allocated = [18.4 * (r / total_rev) for r in revenue_share]
    fig, ax = plt.subplots(figsize=(7.8, 4))
    bars = ax.bar(services, allocated, color=[NAVY, ACCENT, NAVY, ACCENT])
    for b, v, p in zip(bars, allocated, pct):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.15, f"${v:.1f}m\n({p:.0f}%)",
                ha="center", fontsize=9, fontweight="bold", color="#1a2e42")
    ax.set_ylabel("Allocated shared cost (USD m)")
    ax.set_title("Shared Infrastructure Cost Allocation — Revenue-based ($18.4m total)", fontsize=12, pad=10, color=NAVY)
    ax.set_ylim(0, max(allocated) * 1.25)
    ax.grid(axis="y", alpha=0.25)
    return fig_to_b64()


def cloud_growth_chart() -> str:
    quarters = ["Q1 20X4", "Q2 20X4", "Q3 20X4", "Q4 20X4", "Q1 20X5", "Q2 20X5", "Q3 20X5", "Q4 20X5"]
    spend = [3.9, 4.4, 4.6, 5.5, 5.7, 6.1, 6.4, 6.4]
    fig, ax = plt.subplots(figsize=(8, 3.6))
    ax.plot(quarters, spend, color=NAVY, linewidth=2.4, marker="o")
    ax.fill_between(range(len(quarters)), spend, alpha=0.12, color=NAVY)
    ax.annotate("+34% YoY", xy=(7, 6.4), xytext=(5.2, 5.0),
                fontsize=11, fontweight="bold", color=GREEN_OK,
                arrowprops=dict(arrowstyle="->", color=GREEN_OK, lw=1.6))
    ax.set_ylabel("Quarterly cloud spend (USD m)")
    ax.set_title("Cloud Hosting Spend — Quarterly Trend", fontsize=12, pad=10, color=NAVY)
    ax.grid(alpha=0.25)
    plt.xticks(rotation=30, ha="right")
    return fig_to_b64()


def sovereign_benchmark_chart() -> str:
    categories = ["IDSC Sovereign AI\n(Reported)", "Commercial average", "AWS Bedrock\nbenchmark", "Azure OpenAI\nbenchmark"]
    unit_cost = [0.68, 1.00, 0.97, 1.04]
    colours = [GREEN_OK, "#999999", "#999999", "#999999"]
    fig, ax = plt.subplots(figsize=(7.8, 3.8))
    bars = ax.bar(categories, unit_cost, color=colours)
    for b, v in zip(bars, unit_cost):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.02,
                f"{v:.2f}", ha="center", fontsize=10, fontweight="bold")
    ax.axhline(1.00, color="#888", linewidth=0.8, linestyle="--")
    ax.text(0, 0.55, "32% below\ncommercial", ha="center", fontsize=10, fontweight="bold", color="white",
            bbox=dict(boxstyle="round,pad=0.4", facecolor=GREEN_OK, edgecolor="none"))
    ax.set_ylim(0, 1.25)
    ax.set_ylabel("Indexed unit cost (Commercial avg = 1.00)")
    ax.set_title("Sovereign AI Infrastructure — Unit Cost Benchmark", fontsize=12, pad=10, color=NAVY)
    ax.grid(axis="y", alpha=0.25)
    return fig_to_b64()


HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>IDSC Cost Analytics — Service Cost Allocation Review</title>
<style>
  body {{ font-family: "Segoe UI", -apple-system, Roboto, Helvetica, Arial, sans-serif;
         color: #1B2A4A; max-width: 920px; margin: 1.6rem auto; padding: 0 1.6rem 3rem; line-height: 1.55; }}
  h1 {{ font-size: 1.7rem; border-bottom: 3px solid #1B2A4A; padding-bottom: .4rem; color: #1B2A4A; margin-bottom: .3rem;}}
  h2 {{ color: #1B2A4A; margin-top: 1.8rem; padding-bottom: .25rem; border-bottom: 1px solid #cfdbe9; font-size: 1.15rem;}}
  h3 {{ color: #4B92DB; margin-top: 1.2rem; font-size: .95rem; text-transform: uppercase; letter-spacing: .05em;}}
  .meta {{ color: #555; font-size: .9rem; }}
  .pill {{ display: inline-block; background:#e7f0f8; color:#1B2A4A; border-radius:999px;
           padding:.15rem .7rem; font-size:.78rem; margin-right:.4rem; }}
  .badge-ai {{ display:inline-block; background:#1B2A4A; color:white; padding:.25rem .7rem;
               border-radius:4px; font-size:.78rem; font-weight:600; margin-left:.4rem;}}
  .kpis {{ display: grid; grid-template-columns: repeat(4,1fr); gap:.8rem; margin: 1rem 0; }}
  .kpi {{ background:#f5f8fb; border-left:4px solid #1B2A4A; padding:.85rem 1rem; border-radius:4px; }}
  .kpi .num {{ font-size:1.55rem; font-weight:700; color:#1B2A4A; }}
  .kpi .lbl {{ font-size:.78rem; color:#555; text-transform: uppercase; letter-spacing:.04em; }}
  .kpi.green {{ border-left-color:#2e7d32;}} .kpi.green .num {{ color:#2e7d32;}}
  .chart {{ margin: 1rem 0 1.4rem 0; text-align:center; }}
  .chart img {{ max-width: 100%; border: 1px solid #e0e6ee; border-radius: 4px; }}
  .chart .cap {{ font-size:.82rem; color:#666; margin-top:.3rem; }}
  table {{ border-collapse: collapse; width: 100%; margin: .6rem 0 1rem; font-size:.92rem; }}
  th, td {{ border: 1px solid #d6dee9; padding: .45rem .65rem; text-align:left; }}
  th {{ background: #eef3f9; color:#1B2A4A; }}
  td.num {{ text-align:right; font-variant-numeric: tabular-nums; font-family:"Consolas",monospace;}}
  .callout {{ background:#f0f6ec; border-left:4px solid #2e7d32; padding:.95rem 1rem; border-radius:4px; margin:1rem 0; font-size:.93rem;}}
  .callout.blue {{ background:#eef3f9; border-left-color:#1B2A4A;}}
  .callout strong {{ display:block; margin-bottom:.2rem; }}
  footer {{ color:#999; font-size:.8rem; margin:2rem 0 1rem 0; border-top:1px solid #eee; padding-top:.8rem; }}
</style></head><body>

<h1>Service Cost Allocation Review <span class="badge-ai">AI-generated</span></h1>
<div class="meta">IDSC Cost Analytics Module · Microsoft Dynamics 365 · Run date: 14 January 20X6
  <div style="margin-top:.4rem;">
    <span class="pill">FY 20X5 actuals</span><span class="pill">4 service lines</span><span class="pill">28 partner orgs</span>
    <span class="pill">Single-rate staff costing</span><span class="pill">Revenue-based shared allocation</span>
  </div>
</div>

<h2>Executive Summary</h2>
<p>The Centre's four service lines collectively recovered <strong>104.3%</strong> of their fully-loaded operating cost in FY 20X5, generating a small operating surplus consistent with our "cost-recovery plus modest reserve" pricing principle. All four lines are individually surplus-generating on the current allocation basis. Cloud hosting spend has grown <strong>+34% year-on-year</strong>, reflecting strong partner uptake of cloud-hosted services. The flagship <strong>Sovereign AI Infrastructure</strong> programme delivers unit costs <strong>32% below comparable commercial alternatives</strong>, validating the strategic case for in-house provision.</p>

<div class="kpis">
  <div class="kpi green"><div class="num">104.3%</div><div class="lbl">Overall cost recovery</div></div>
  <div class="kpi green"><div class="num">−32%</div><div class="lbl">Sovereign AI vs commercial</div></div>
  <div class="kpi"><div class="num">4 / 4</div><div class="lbl">Service lines in surplus</div></div>
  <div class="kpi"><div class="num">+34%</div><div class="lbl">Cloud spend YoY</div></div>
</div>

<h2>Methodology</h2>
<p>The analytics module aggregates direct service-line costs from Microsoft Dynamics 365 cost centres by service line, applies a group-average staff cost rate to FTE allocations from the timesheet system, and distributes shared infrastructure costs proportionally to service-line revenue. The model is consistent with industry practice and ensures that larger service lines bear a proportionally larger share of shared infrastructure cost.</p>

<h3>Key inputs</h3>
<table>
  <thead><tr><th>Input</th><th>Source</th><th>Treatment</th></tr></thead>
  <tbody>
    <tr><td>Direct staff cost</td><td>Dynamics cost centres</td><td>Group-average rate $185,000 per FTE × allocated FTE per service line</td></tr>
    <tr><td>Direct equipment / licences</td><td>Dynamics fixed asset register, AP module</td><td>Service-line cost centre allocation</td></tr>
    <tr><td>Cloud hosting</td><td>AWS / Azure / GCP usage feeds</td><td>Tagged consumption per service line</td></tr>
    <tr><td>Shared infrastructure ($18.4m)</td><td>Data centre, network, shared platform</td><td>Allocated proportional to service-line revenue</td></tr>
    <tr><td>WHO administrative charge ($5.47m)</td><td>Hosting MOU; 8% of staff costs</td><td>Held as Group overhead — not allocated to service lines</td></tr>
  </tbody>
</table>

<h2>Service Line Performance</h2>
<div class="chart"><img src="data:image/png;base64,{recovery_b64}" alt="Service line revenue vs direct cost"><div class="cap">All four service lines are individually surplus-generating on the current allocation basis.</div></div>

<table>
  <thead><tr><th>Service line</th><th class="num">Revenue ($m)</th><th class="num">Direct cost ($m)</th><th class="num">Surplus ($m)</th><th class="num">Cost recovery</th><th class="num">Partners</th></tr></thead>
  <tbody>
    <tr><td>Managed Infrastructure</td><td class="num">42.3</td><td class="num">38.1</td><td class="num">4.2</td><td class="num">111%</td><td class="num">22</td></tr>
    <tr><td>Application Hosting</td><td class="num">61.8</td><td class="num">54.2</td><td class="num">7.6</td><td class="num">114%</td><td class="num">18</td></tr>
    <tr><td>Cybersecurity</td><td class="num">38.2</td><td class="num">33.9</td><td class="num">4.3</td><td class="num">113%</td><td class="num">14</td></tr>
    <tr><td>Sovereign AI Infrastructure</td><td class="num">15.9</td><td class="num">8.2</td><td class="num">7.7</td><td class="num">194%</td><td class="num">11</td></tr>
  </tbody>
</table>

<h2>Shared Infrastructure Allocation</h2>
<p>Shared infrastructure (data centre, network backbone, shared platform tooling, shared SOC) totalling $18.4m is distributed across the four service lines proportional to their share of total service-line revenue. This approach is straightforward to administer, audit-friendly, and aligned with the principle that beneficiaries of higher-revenue services contribute proportionally to the underlying capacity.</p>

<div class="chart"><img src="data:image/png;base64,{shared_b64}" alt="Shared infrastructure allocation"><div class="cap">Revenue-based allocation of the $18.4m shared infrastructure pool.</div></div>

<h2>Cloud Hosting Trend</h2>
<div class="chart"><img src="data:image/png;base64,{cloud_b64}" alt="Cloud spend trend"><div class="cap">Cloud spend has grown 34% year-on-year, reflecting strong partner uptake.</div></div>

<h2>Sovereign AI Infrastructure — Cost Competitiveness</h2>
<p>The Sovereign AI Infrastructure programme delivered $15.9m in revenue against $8.2m of direct cost in FY 20X5. Benchmarked against comparable commercial offerings (AWS Bedrock, Azure OpenAI, and the median of three other commercial cloud-AI providers), our blended unit cost is approximately <strong>32% below the commercial average</strong>.</p>
<p>This validates the Centre's strategic decision to develop in-house Sovereign AI capability rather than rely on commercial providers for partner-sensitive workloads. The Director has cited this benchmark in the most recent Management Committee briefing and in IDSC's 20X5 Annual Report.</p>

<div class="chart"><img src="data:image/png;base64,{sov_b64}" alt="Sovereign AI benchmark"><div class="cap">Indexed unit cost vs commercial benchmark (commercial average = 1.00).</div></div>

<div class="callout">
  <strong>Strategic finding</strong>
  Sovereign AI delivers a 32% unit cost advantage over commercial alternatives, with the highest cost recovery ratio of any service line (194%). The programme should be highlighted in partner-facing pricing communications as evidence of the Centre's value proposition versus commercial providers.
</div>

<h2>Partner Pricing Implications</h2>
<p>Under the new pricing model, per-unit prices reflect each service line's allocated cost recovery target. A small number of partners have raised queries on Q3 20X5 invoices; in each case the increase is a function of the new model accurately reflecting allocated cost rather than a calculation error. We recommend a partner-comms package explaining the methodology and the underlying cost drivers.</p>

<h2>Recommendations</h2>
<ol>
  <li>Adopt the proposed cost allocation model as the basis for the FY 20X6 partner pricing schedule.</li>
  <li>Highlight the Sovereign AI cost advantage in partner-facing materials and the next Management Committee briefing.</li>
  <li>Address partner billing queries through a structured comms response explaining the methodology; no technical changes to the model are required.</li>
  <li>Continue current treatment of the WHO administrative charge as Group overhead, consistent with prior years.</li>
  <li>Refresh the model quarterly using actuals from Dynamics; full annual recalibration in Q1 20X7.</li>
</ol>

<div class="callout blue">
  <strong>Next step</strong>
  Recommend Management Committee endorsement of the model at the meeting on 22 January 20X6, with adoption effective for FY 20X6 partner pricing.
</div>

<footer>Generated by the IDSC Cost Analytics Module (Microsoft Dynamics 365). For internal use by the Chief of Management and Strategy Division and senior management.</footer>

</body></html>
"""


def main() -> None:
    recovery_b64 = cost_recovery_chart()
    shared_b64 = shared_alloc_chart()
    cloud_b64 = cloud_growth_chart()
    sov_b64 = sovereign_benchmark_chart()

    html = HTML.format(
        recovery_b64=recovery_b64,
        shared_b64=shared_b64,
        cloud_b64=cloud_b64,
        sov_b64=sov_b64,
    )
    out = OUT_DIR / "task2_exhibit.html"
    out.write_text(html, encoding="utf-8")
    print(f"[ok] wrote {out} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
