# Toxicity evaluation dataset v1.0.0

## Dataset and labeling policy

- Dataset size: 140 original, independently authored examples across 8 scenario groups.
- Versioned CSV: `ml-service/data/evaluation/toxicity_eval_v1.csv`. SHA-256: `301ec93238256fc62d2fbc8ae8e75f2d3afbe6f82dcc6751976bf51689e9441a`.
- The examples were authored for this evaluation and are not sampled or copied from Jigsaw. The labels are policy ground truth assigned during authoring, not third-party or adjudicated human annotations.
- Six binary labels, in model order: toxic, severe_toxic, obscene, threat, insult, identity_hate.
- Neutral-short and ordinary-conversation rows are all-negative.
- Insults are toxic+insult only. Profanity-without-threat rows are obscene only; profanity alone is not a threat, insult, severe-toxicity, or identity-hate label.
- Threat rows are toxic+threat. The short-threat and longer-threat groups are separately reported.
- Severe-toxicity rows are toxic+severe_toxic+insult and contain intense personal degradation without a threat or protected-identity target. Profanity alone is not severe toxicity.
- Identity-hate rows use the explicit `[protected group]` placeholder and express exclusion or denial of equal participation based on identity. They are toxic+identity_hate only. No slurs or real-world group stereotypes are used.
- Labels are deliberately conservative and encode the intended standalone text meaning. Context, quotation, sarcasm, dialect, and annotator disagreement can change real moderation labels.

## Leakage audit

- Compared against 127,656 texts in the production training partition (159,571 non-null texts total). The fixed seed-42 20% held-out partition was excluded. Only text was used; source labels, model scores, and held-out outcomes were not used.
- Exact normalized duplicates: 0.
- Character n-gram cosine near-duplicates at threshold 0.85: 0.
- Maximum nearest-source similarity: 0.84995592.
- Similarity screening is heuristic: paraphrases without substantial character overlap may not be found; common short phrases can have high similarity without being copied.

## Evaluation protocol

- Model: the current checked-in production artifact `ml-service/models/text_toxicity_model.joblib`.
- Scores are rounded to the production API’s six decimals and compared against the unchanged thresholds in `ml-service/src/text/evaluation_protocol.py`.
- This evaluation corpus is not used for training, validation, threshold selection, or model selection.
- The seed-42 untouched holdout is not scored or used to tune this dataset. Source texts are consulted solely for duplicate screening.

## Overall production-model results

- Rows: 140; macro F1: 0.274; micro F1: 0.416; hamming loss: 0.211.

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 80 | 0.611 | 0.412 | 0.493 | 0.350 | 33 | 21 | 39 | 47 |
| severe_toxic | 20 | 0.000 | 0.000 | 0.000 | 0.025 | 0 | 3 | 117 | 20 |
| obscene | 20 | 0.579 | 0.550 | 0.564 | 0.067 | 11 | 8 | 112 | 9 |
| threat | 20 | 0.000 | 0.000 | 0.000 | 0.008 | 0 | 1 | 119 | 20 |
| insult | 40 | 0.760 | 0.475 | 0.585 | 0.060 | 19 | 6 | 94 | 21 |
| identity_hate | 20 | 0.000 | 0.000 | 0.000 | 0.008 | 0 | 1 | 119 | 20 |

## Neutral short-text subset

- Rows: 20; macro F1: 0.000; false-positive label count: 9.

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 0 | 0.000 | 0.000 | 0.000 | 0.200 | 0 | 4 | 16 | 0 |
| severe_toxic | 0 | 0.000 | 0.000 | 0.000 | 0.050 | 0 | 1 | 19 | 0 |
| obscene | 0 | 0.000 | 0.000 | 0.000 | 0.050 | 0 | 1 | 19 | 0 |
| threat | 0 | 0.000 | 0.000 | 0.000 | 0.050 | 0 | 1 | 19 | 0 |
| insult | 0 | 0.000 | 0.000 | 0.000 | 0.050 | 0 | 1 | 19 | 0 |
| identity_hate | 0 | 0.000 | 0.000 | 0.000 | 0.050 | 0 | 1 | 19 | 0 |

## Scenario group metrics

| Group | N | Macro F1 | Micro F1 |
| --- | ---: | ---: | ---: |
| neutral_short | 20 | 0.000 | 0.000 |
| ordinary_conversation | 20 | 0.000 | 0.000 |
| insult | 20 | 0.262 | 0.712 |
| profanity_no_threat | 20 | 0.118 | 0.407 |
| short_threat | 12 | 0.083 | 0.286 |
| longer_threat | 8 | 0.067 | 0.222 |
| severe_toxicity | 20 | 0.218 | 0.500 |
| identity_hate | 20 | 0.000 | 0.000 |

## Limitations

- At 20 examples per scenario, this is more informative than the previous 26-prompt challenge but remains a small curated benchmark, not a statistically powered estimate of production prevalence.
- Examples are authored by one project contributor/workflow and labels have not been independently adjudicated. Identity-hate uses a placeholder rather than real identity terms, limiting lexical coverage.
- Performance on this dataset is descriptive only. Do not alter production thresholds or promote a model from these results; any candidate must use development-only validation followed by a pre-registered evaluation on a genuinely untouched holdout.

## Reproduction

From the repository root:

```powershell
& .\ml-service\.venv\Scripts\python.exe ml-service\src\text\evaluate_toxicity_dataset.py
& .\ml-service\.venv\Scripts\python.exe -m unittest discover -s ml-service\tests -v
node --test backend\tests\analysisService.test.js backend\tests\videoRiskScore.test.js
```

The evaluator writes `ml-service/reports/toxicity_eval_v1_report.md`. It does not write or modify model artifacts or thresholds.
