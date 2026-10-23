# ModerAI text diagnostic evaluation

## Protocol and provenance

- Source: `ml-service/data/raw/text/train.csv`, prepared by `ml-service/src/text/prepare_data.py` into `ml-service/data/processed/cleaned_train.csv`.
- The current production model was trained from the processed Jigsaw training corpus using the deterministic 80/20 split `train_test_split(test_size=0.20, random_state=42)`.
- Diagnostic positives are sampled only from that split’s reserved 20%, so they were excluded from production-model fitting. Source labels are retained as the six ground-truth labels. The diagnostic set is never used for candidate fitting or selection.
- Twenty hand-authored neutral controls (short pronouns and conversational/polite phrases) are explicitly all-negative. The five regression prompts are included. The insult example is labeled toxic and insult only; the threat example toxic and threat only. Profanity does not imply severe toxicity or identity hate.
- For each of the six labels, the diagnostic set includes 20 unique source-labeled positive examples. The sampler prioritizes examples with fewer simultaneous positive labels. Dataset excerpts are evaluated in memory and are not copied into this report.
- Production decisions use the unchanged configured thresholds and six-decimal scores returned by the ML API. No threshold selection is performed.
- Candidate comparison uses a separate deterministic 80/20 train/validation split of the development partition. Both models train on the candidate train portion and are compared on validation only. The untouched reserved remainder is not used to choose or tune the candidate.
- The candidate changes only Logistic Regression `C` from the baseline default to 2.0, as a predeclared exploratory candidate. It is not saved or promoted.

## Diagnostic set

- Rows: 142 (including source-labeled positive samples and neutral controls).
- Group counts: Jigsaw-labeled identity_hate positive: 20, Jigsaw-labeled insult positive: 20, Jigsaw-labeled obscene positive: 20, Jigsaw-labeled severe_toxic positive: 20, Jigsaw-labeled threat positive: 20, Jigsaw-labeled toxic positive: 20, insult: 1, neutral short pronoun: 4, polite/conversational: 16, threat: 1
- This is a deliberately balanced diagnostic sample, not a prevalence-representative production estimate. Jigsaw annotations are inherited and may be noisy; performance should not be generalized from this small curated sample.

## Production artifact on diagnostic set

- Rows: 142; macro F1: 0.460; micro F1: 0.508; hamming loss: 0.204.

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 69 | 0.667 | 0.667 | 0.667 | 0.315 | 46 | 23 | 50 | 23 |
| severe_toxic | 20 | 0.600 | 0.300 | 0.400 | 0.033 | 6 | 4 | 118 | 14 |
| obscene | 25 | 0.419 | 0.520 | 0.464 | 0.154 | 13 | 18 | 99 | 12 |
| threat | 23 | 0.750 | 0.652 | 0.698 | 0.042 | 15 | 5 | 114 | 8 |
| insult | 24 | 0.125 | 0.167 | 0.143 | 0.237 | 4 | 28 | 90 | 20 |
| identity_hate | 20 | 0.545 | 0.300 | 0.387 | 0.041 | 6 | 5 | 117 | 14 |

## Existing regression prompts

Scores are listed in label order: toxic, severe_toxic, obscene, threat, insult, identity_hate. The last column is threshold output; the existing backend short-transcript policy is unchanged.

| Input | Ground-truth group | Raw scores | Labels above threshold |
| --- | --- | --- | --- |
| You? | neutral short pronoun | 0.999753, 0.960957, 0.993980, 0.952442, 0.999876, 0.882882 | toxic, severe_toxic, obscene, threat, insult, identity_hate |
| Hello, how are you? | polite/conversational | 0.461491, 0.068697, 0.293683, 0.033517, 0.355036, 0.248791 | none |
| Thank you for your help. | polite/conversational | 0.010134, 0.005885, 0.011588, 0.010272, 0.022602, 0.007927 | none |
| You are an idiot. | insult | 0.999992, 0.324039, 0.997655, 0.017187, 0.999998, 0.587395 | toxic, obscene, insult |
| I will kill you. | threat | 0.989043, 0.749215, 0.823909, 0.999988, 0.637390, 0.215818 | toxic, obscene, threat |

## Candidate comparison (validation only)

- Split: 102124 train / 25532 validation rows (seed 2026).
- The diagnostic set and reserved production split were excluded.

| Model | Macro F1 | Micro F1 | Hamming loss |
| --- | ---: | ---: | ---: |
| same_configuration_baseline | 0.6166 | 0.7280 | 0.0194 |
| candidate_logistic_regression_C_2 | 0.6228 | 0.7355 | 0.0187 |

Per-label validation metrics:

### same_configuration_baseline

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 2422 | 0.828 | 0.723 | 0.772 | 0.016 | 1751 | 365 | 22745 | 671 |
| severe_toxic | 238 | 0.350 | 0.588 | 0.439 | 0.010 | 140 | 260 | 25034 | 98 |
| obscene | 1356 | 0.831 | 0.763 | 0.796 | 0.009 | 1035 | 210 | 23966 | 321 |
| threat | 70 | 0.538 | 0.500 | 0.519 | 0.001 | 35 | 30 | 25432 | 35 |
| insult | 1246 | 0.706 | 0.723 | 0.715 | 0.015 | 901 | 375 | 23911 | 345 |
| identity_hate | 218 | 0.423 | 0.505 | 0.460 | 0.006 | 110 | 150 | 25164 | 108 |

### candidate_logistic_regression_C_2

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 2422 | 0.830 | 0.735 | 0.779 | 0.016 | 1779 | 365 | 22745 | 643 |
| severe_toxic | 238 | 0.375 | 0.546 | 0.444 | 0.009 | 130 | 217 | 25077 | 108 |
| obscene | 1356 | 0.835 | 0.766 | 0.799 | 0.008 | 1039 | 205 | 23971 | 317 |
| threat | 70 | 0.540 | 0.486 | 0.511 | 0.001 | 34 | 29 | 25433 | 36 |
| insult | 1246 | 0.709 | 0.717 | 0.713 | 0.015 | 893 | 367 | 23919 | 353 |
| identity_hate | 218 | 0.484 | 0.495 | 0.490 | 0.005 | 108 | 115 | 25199 | 110 |

## Interpretation

- Candidate minus baseline validation macro F1: +0.0062; micro F1: +0.0075.
- The small validation gains merit further investigation, not promotion. This is one comparison; any apparent gain requires confirmation on a future untouched holdout and review of rare-label precision/recall.
- The neutral short pronoun `You?` remains a known false positive if its threshold scores persist in the diagnostic reproduction. This experiment changes no runtime moderation behavior.

## Exact reproduction commands

From the repository root:

```powershell
& .\ml-service\.venv\Scripts\python.exe ml-service\src\text\text_diagnostic_experiment.py
& .\ml-service\.venv\Scripts\python.exe -m unittest discover -s ml-service\tests -v
node --test backend\tests\analysisService.test.js
```

No production thresholds, production model files, or runtime moderation code are modified by this experiment.
