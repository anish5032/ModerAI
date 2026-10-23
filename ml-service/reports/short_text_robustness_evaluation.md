# Short-text robustness experiment

## Root-cause interpretation

The production pipeline uses independent, class-weighted one-vs-rest Logistic Regression classifiers over TF-IDF word uni/bi-grams. The vectorizer maps `You?` to the single feature `you`; each classifier therefore scores a context-free token, not the utterance’s intent. Class weighting and sparse rare-category examples can make these learned token associations produce extreme outputs. The existing backend guard is a hand-maintained neutral-pattern exception and does not match `You?`; adding blanket short-text suppression would also hide real short threats.

## Experiment design

- Baseline: same TF-IDF + One-vs-Rest Logistic Regression architecture and production thresholds, refit on the candidate fit split.
- Candidate: same architecture and thresholds, plus fit-only hand-authored examples spanning benign pronoun/conversation snippets, insults, obscene insults, and threats. There are 27 such rows; explicit six-label targets are attached, and profanity is not labeled severe-toxic or identity-hate.
- Short-text validation challenge consists of 26 distinct hand-authored prompts (12 neutral, 6 insult, 2 obscene, 6 threat). Threat examples remain positive examples; the experiment has no short-text bypass.
- Development/untouched split: the existing seed-42 80/20 partition has 127656 development rows and 31915 untouched held-out rows. The held-out 20% is not accessed for scoring, fitting, or candidate decisions.
- The development partition is split 80/20 with seed 2026 into 102124 fit and 25532 validation rows. Both models train on the same fit rows; only the candidate gets the augmentation. The hand-authored validation challenge is separate and has no shared text with augmentation or source data.
- Thresholds are unchanged. This is a validation-only experiment; neither model nor threshold is promoted or written to a production artifact.

## Full corpus validation metrics

| Model | Macro F1 | Micro F1 | Hamming loss |
| --- | ---: | ---: | ---: |
| baseline | 0.6166 | 0.7280 | 0.0194 |
| short_text_augmented | 0.6174 | 0.7283 | 0.0193 |

### baseline per-label validation

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 2422 | 0.828 | 0.723 | 0.772 | 0.016 | 1751 | 365 | 22745 | 671 |
| severe_toxic | 238 | 0.350 | 0.588 | 0.439 | 0.010 | 140 | 260 | 25034 | 98 |
| obscene | 1356 | 0.831 | 0.763 | 0.796 | 0.009 | 1035 | 210 | 23966 | 321 |
| threat | 70 | 0.538 | 0.500 | 0.519 | 0.001 | 35 | 30 | 25432 | 35 |
| insult | 1246 | 0.706 | 0.723 | 0.715 | 0.015 | 901 | 375 | 23911 | 345 |
| identity_hate | 218 | 0.423 | 0.505 | 0.460 | 0.006 | 110 | 150 | 25164 | 108 |

### short_text_augmented per-label validation

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 2422 | 0.828 | 0.722 | 0.771 | 0.016 | 1749 | 364 | 22746 | 673 |
| severe_toxic | 238 | 0.353 | 0.592 | 0.443 | 0.010 | 141 | 258 | 25036 | 97 |
| obscene | 1356 | 0.832 | 0.765 | 0.797 | 0.009 | 1037 | 210 | 23966 | 319 |
| threat | 70 | 0.538 | 0.500 | 0.519 | 0.001 | 35 | 30 | 25432 | 35 |
| insult | 1246 | 0.706 | 0.722 | 0.714 | 0.015 | 900 | 375 | 23911 | 346 |
| identity_hate | 218 | 0.425 | 0.505 | 0.461 | 0.006 | 110 | 149 | 25165 | 108 |

## Short-text challenge metrics

| Model | Macro F1 | Micro F1 | Hamming loss |
| --- | ---: | ---: | ---: |
| baseline | 0.4639 | 0.7576 | 0.1026 |
| short_text_augmented | 0.4966 | 0.7941 | 0.0897 |

### baseline per-label short-text challenge

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 14 | 0.875 | 1.000 | 0.933 | 0.167 | 14 | 2 | 10 | 0 |
| severe_toxic | 0 | 0.000 | 0.000 | 0.000 | 0.038 | 0 | 1 | 25 | 0 |
| obscene | 2 | 0.125 | 0.500 | 0.200 | 0.292 | 1 | 7 | 17 | 1 |
| threat | 6 | 0.800 | 0.667 | 0.727 | 0.050 | 4 | 1 | 19 | 2 |
| insult | 6 | 0.857 | 1.000 | 0.923 | 0.050 | 6 | 1 | 19 | 0 |
| identity_hate | 0 | 0.000 | 0.000 | 0.000 | 0.038 | 0 | 1 | 25 | 0 |

### short_text_augmented per-label short-text challenge

| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| toxic | 14 | 0.875 | 1.000 | 0.933 | 0.167 | 14 | 2 | 10 | 0 |
| severe_toxic | 0 | 0.000 | 0.000 | 0.000 | 0.038 | 0 | 1 | 25 | 0 |
| obscene | 2 | 0.125 | 0.500 | 0.200 | 0.292 | 1 | 7 | 17 | 1 |
| threat | 6 | 0.857 | 1.000 | 0.923 | 0.050 | 6 | 1 | 19 | 0 |
| insult | 6 | 0.857 | 1.000 | 0.923 | 0.050 | 6 | 1 | 19 | 0 |
| identity_hate | 0 | 0.000 | 0.000 | 0.000 | 0.038 | 0 | 1 | 25 | 0 |

## Existing regression examples

Each score object contains the six model outputs in named form. Detections use the configured production thresholds.

| Text | Ground truth | Baseline detections | Candidate detections |
| --- | --- | --- | --- |
| You? | neutral | toxic, severe_toxic, obscene, threat, insult, identity_hate | toxic, severe_toxic, obscene, threat, insult, identity_hate |
| Hello, how are you? | neutral | none | none |
| Thank you for your help. | neutral | none | none |
| You are an idiot. | insult | toxic, obscene, insult | toxic, obscene, insult |
| I will kill you. | threat | toxic, obscene, threat | toxic, obscene, threat |

Named raw scores for the same regression prompts:

| Text | Model | toxic | severe_toxic | obscene | threat | insult | identity_hate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| You? | baseline | 0.999753 | 0.952874 | 0.996227 | 0.965764 | 0.999911 | 0.913372 |
| You? | short_text_augmented | 0.999734 | 0.943638 | 0.995813 | 0.973394 | 0.999896 | 0.898210 |
| Hello, how are you? | baseline | 0.404440 | 0.076711 | 0.276192 | 0.030925 | 0.241395 | 0.206499 |
| Hello, how are you? | short_text_augmented | 0.397561 | 0.076043 | 0.269467 | 0.031511 | 0.240319 | 0.204775 |
| Thank you for your help. | baseline | 0.014256 | 0.008788 | 0.014208 | 0.014082 | 0.028476 | 0.009380 |
| Thank you for your help. | short_text_augmented | 0.014230 | 0.008668 | 0.014186 | 0.013898 | 0.028410 | 0.009357 |
| You are an idiot. | baseline | 0.999985 | 0.355314 | 0.996432 | 0.031843 | 0.999993 | 0.245542 |
| You are an idiot. | short_text_augmented | 0.999985 | 0.348046 | 0.996202 | 0.032754 | 0.999994 | 0.243903 |
| I will kill you. | baseline | 0.986098 | 0.811841 | 0.846648 | 0.999983 | 0.641035 | 0.205084 |
| I will kill you. | short_text_augmented | 0.986530 | 0.813513 | 0.848994 | 0.999986 | 0.647133 | 0.203973 |

## Interpretation and limitations

- Neutral challenge false-positive label count: baseline 7; candidate 7. These are counts of individual label false alarms across the neutral examples, not a population rate.
- Short-threat recall: baseline 0.667 (4/6); candidate 1.000 (6/6).
- Hand-authored prompts are a small, curated challenge set; labels represent the authors’ intended meaning, and model performance does not generalize to all conversational dialects, sarcasm, quoted speech, or transcription errors.
- Severe-toxic and identity-hate have no positive examples in this hand-authored challenge, so those challenge-set recall/F1 values are not meaningful. Their performance is still measured on the full Jigsaw validation split; the curated labels avoid inventing identity-hate or severe-toxicity ground truth.
- The candidate is only one augmentation recipe. Its short challenge is specifically aligned to that recipe; broad balanced conversational data and independently authored evaluation are needed before any deployment proposal.
- The full validation table checks for regressions on the existing distribution. A candidate gain on the curated set alone is insufficient. The seed-42 held-out 20% remains untouched and must be reserved for a later pre-registered final evaluation.

## Reproduction

From the repository root:

```powershell
& .\ml-service\.venv\Scripts\python.exe ml-service\src\text\short_text_robustness_experiment.py
& .\ml-service\.venv\Scripts\python.exe -m unittest discover -s ml-service\tests -v
node --test backend\tests\analysisService.test.js backend\tests\videoRiskScore.test.js
```

This script does not alter backend short-text handling, thresholds, production model artifacts, or moderation event behavior.
