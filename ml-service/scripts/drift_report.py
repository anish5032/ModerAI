from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import argparse
import json
import math
import os
import statistics
import sys

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOG = ROOT / "logs" / "predictions.jsonl"
DEFAULT_OUTPUT = ROOT / "logs" / "drift_report.md"


def load_predictions(path):
    records = []
    if not path.is_file():
        return records

    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record.get("type") == "prediction":
                records.append(record)
    return records


def summarize(values):
    ordered = sorted(values)
    count = len(ordered)

    def percentile(fraction):
        if not ordered:
            return 0.0
        index = min(count - 1, max(0, math.ceil(fraction * count) - 1))
        return ordered[index]

    return {
        "count": count,
        "mean": statistics.fmean(ordered),
        "p50": percentile(0.5),
        "p95": percentile(0.95),
        "rate50": sum(value >= 0.5 for value in ordered) / count,
        "rate80": sum(value >= 0.8 for value in ordered) / count,
    }


def compare_windows(records, min_samples):
    grouped = defaultdict(lambda: defaultdict(list))

    for record in records:
        key = (record.get("endpoint"), record.get("model"))
        for label, score in (record.get("scores") or {}).items():
            if isinstance(score, (int, float)):
                grouped[key][label].append(float(score))

    rows = []
    for (endpoint, model), labels in sorted(grouped.items()):
        for label, values in sorted(labels.items()):
            if len(values) < min_samples * 2:
                continue
            split = len(values) // 2
            baseline = summarize(values[:split])
            current = summarize(values[split:])
            mean_delta = current["mean"] - baseline["mean"]
            rate_delta = current["rate50"] - baseline["rate50"]
            drifted = abs(mean_delta) >= 0.10 or abs(rate_delta) >= 0.10
            rows.append(
                {
                    "endpoint": endpoint,
                    "model": model,
                    "label": label,
                    "baseline": baseline,
                    "current": current,
                    "meanDelta": mean_delta,
                    "rate50Delta": rate_delta,
                    "drifted": drifted,
                }
            )

    return rows


def render_report(records, rows, log_path):
    lines = [
        "# Prediction drift report",
        "",
        f"- Source: `{log_path}`",
        f"- Prediction records: {len(records)}",
        "- Baseline: first half of each endpoint/model/label series",
        "- Current: second half of each endpoint/model/label series",
        "- Drift signal: absolute mean delta >= 0.10 or rate(score >= 0.50) delta >= 0.10",
        "- Scores are model outputs, not calibrated probabilities.",
        "",
    ]

    if not records:
        lines.append(
            "No prediction records found. Generate traffic or set "
            "`PREDICTION_LOG_PATH` to an existing JSONL log."
        )
        return "\n".join(lines) + "\n"

    if not rows:
        lines.append(
            "Not enough samples for a baseline/current comparison. "
            "Each series needs at least two windows of the configured size."
        )
        return "\n".join(lines) + "\n"

    lines.extend(
        [
            "| Endpoint | Label | Baseline mean | Current mean | Mean delta | Baseline >= 0.50 | Current >= 0.50 | Drift |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
        ]
    )
    for row in rows:
        lines.append(
            "| {endpoint} | {label} | {bmean:.4f} | {cmean:.4f} | "
            "{mdelta:+.4f} | {brate:.2%} | {crate:.2%} | {drift} |".format(
                endpoint=row["endpoint"],
                label=row["label"],
                bmean=row["baseline"]["mean"],
                cmean=row["current"]["mean"],
                mdelta=row["meanDelta"],
                brate=row["baseline"]["rate50"],
                crate=row["current"]["rate50"],
                drift="**yes**" if row["drifted"] else "no",
            )
        )

    flagged = [row for row in rows if row["drifted"]]
    lines.extend(
        [
            "",
            f"Flagged series: {len(flagged)} of {len(rows)}.",
            "",
            "This is a manual monitoring aid, not proof of model degradation. "
            "Investigate changes in traffic mix, thresholds, and upstream data.",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Summarize score drift from privacy-preserving JSONL logs."
    )
    parser.add_argument(
        "--log",
        default=os.environ.get("PREDICTION_LOG_PATH", str(DEFAULT_LOG)),
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--min-samples", type=int, default=20)
    args = parser.parse_args()

    log_path = Path(args.log)
    records = load_predictions(log_path)
    rows = compare_windows(records, max(2, args.min_samples))
    report = render_report(records, rows, log_path)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf-8")

    print(report)
    print(f"Wrote {output_path}")
    return 0 if records else 1


if __name__ == "__main__":
    sys.exit(main())
