# ModerAI model comparison report

## Protocol
- Dataset: ml-service/data/processed/cleaned_train.csv
- Split: deterministic 80/20 train/test, then 25% of remaining set as validation (random_state=42)
- Model family: TF-IDF + One-vs-Rest Logistic Regression
- Production thresholds remain unchanged and are not tuned on the test set
- Final selection uses validation data only; the final test set remains untouched until final evaluation

## Baseline and candidates
- Baseline: TF-IDF + One-vs-Rest Logistic Regression with class_weight='balanced' (repo default)
- Candidate 1: same model, C=2.0, class_weight='balanced'
- Candidate 2: same model, C=0.5, class_weight='balanced'

## Validation metrics (using production thresholds)
| Model | Macro-F1 | Micro-F1 | Hamming loss |
| --- | ---: | ---: | ---: |
| baseline_lr_balanced | 0.6156 | 0.7363 | 0.0192 |
| lr_c2_balanced | 0.6148 | 0.7397 | 0.0188 |
| lr_c0_5_balanced | 0.6089 | 0.7273 | 0.0199 |

## Held-out test metrics (same test split, no threshold tuning)
| Model | Macro-F1 | Micro-F1 | Hamming loss |
| --- | ---: | ---: | ---: |
| baseline_lr_balanced | 0.6346 | 0.7327 | 0.0198 |
| lr_c2_balanced | 0.6251 | 0.7378 | 0.0192 |
| lr_c0_5_balanced | 0.6264 | 0.7187 | 0.0208 |

## Per-label test F1 highlights
| Model | toxic | severe_toxic | obscene | threat | insult | identity_hate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline_lr_balanced | 0.7679 | 0.5044 | 0.7812 | 0.5556 | 0.7394 | 0.4595 |
| lr_c2_balanced | 0.7774 | 0.4729 | 0.7887 | 0.5405 | 0.7384 | 0.4328 |
| lr_c0_5_balanced | 0.7500 | 0.5062 | 0.7733 | 0.5556 | 0.7302 | 0.4430 |

## Interpretation
- The C=2.0 candidate slightly improves micro-F1 and hamming loss on the test set, but it lowers macro-F1 relative to baseline and performs worse on the weak rare labels, especially severe_toxic and identity_hate.
- The C=0.5 candidate improves severe_toxic slightly but degrades macro-F1 and micro-F1 more broadly.
- The original baseline remains the best-supported production model because it offers the most balanced performance without a fair evidence-based gain in the rare and risky classes.
- Threat remains extremely sparse in the dataset (18 positive examples in the held-out test split), so any observed gain is not statistically stable enough to justify a model change.
- There is insufficient evidence to promote a different classifier or retrain the production model.
