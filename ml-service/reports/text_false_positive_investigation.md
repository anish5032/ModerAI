# ModerAI short-text false-positive investigation

## Finding

The production model classifies the neutral transcript `You?` above every
production category threshold. This is a model-level false positive, not a
transcript preprocessing mismatch, label-order error, score mapping error, or
backend threshold comparison error.

The TF-IDF analyzer converts `You?` to a single feature, `you`. The saved
One-vs-Rest Logistic Regression model has a strongly positive coefficient for
that feature in every classifier:

| Label | `you` coefficient | `You?` score | Production threshold | Final label |
| --- | ---: | ---: | ---: | --- |
| toxic | 9.7080 | 0.999753 | 0.72 | yes |
| severe_toxic | 6.1601 | 0.960957 | 0.82 | yes |
| obscene | 7.4092 | 0.993980 | 0.72 | yes |
| threat | 7.2812 | 0.952442 | 0.90 | yes |
| insult | 11.2576 | 0.999876 | 0.74 | yes |
| identity_hate | 5.0738 | 0.882882 | 0.82 | yes |

The outputs are independent per-label scores; they are not mutually exclusive
class probabilities. The model was trained with `class_weight='balanced'`,
which is consistent with the strong response for a feature correlated with
positive labels, but does not by itself prove why each coefficient was learned.
The dataset has 159,571 rows; 75,701 contain `you`. In that subset, positive
label rates range from 0.49% (threat) to 12.68% (toxic), versus 0.30% to 9.58%
overall. None of the five exact test prompts appears in the training data.

## Prediction path checked

1. Video segments are trimmed and joined per chunk in
   `backend/services/analysisService.js`. `predictText` trims once more before
   sending the text to the ML API.
2. `ml-service/api.py` strips outer whitespace and calls the saved pipeline's
   `predict_proba`; the fitted TF-IDF vectorizer lowercases and tokenizes the
   text. Training also strips whitespace, and the vectorizer uses the same
   lowercasing/tokenization configuration.
3. The API zips the saved label list with the score vector and returns named,
   six-decimal scores. The saved order matches the six training columns.
4. `analysisService.js` turns those named scores into entries and compares each
   with the matching configured threshold using `score >= threshold`.
5. The existing neutral-short-text allowlist does not match `You?`: its
   punctuation prevents the generic short-text fallback, and it is not one of
   the listed neutral patterns. The later short-transcript handling removes
   only a toxic-only detection; `You?` also crosses the severe-toxic and threat
   thresholds, so none of its six labels are removed. All resulting moderation
   detections are routed for human review, not automatically blocked.

The returned/displayed `categoryScores` retain the named raw scores. No label
swap or score transformation occurs in the Node service; displayed percentages
are generated from those values.

## Reproduced cases

Raw score order in each row: toxic, severe_toxic, obscene, threat, insult,
identity_hate. Final labels are the backend detections after configured
thresholding and current short-transcript handling.

| Transcript | Raw scores | Final labels |
| --- | --- | --- |
| `You?` | 0.999753, 0.960957, 0.993980, 0.952442, 0.999876, 0.882882 | toxic, severe_toxic, obscene, threat, insult, identity_hate |
| `Hello, how are you?` | 0.461491, 0.068697, 0.293683, 0.033517, 0.355036, 0.248791 | none |
| `Thank you for your help.` | 0.010134, 0.005885, 0.011588, 0.010272, 0.022602, 0.007927 | none |
| `You are an idiot.` | 0.999992, 0.324039, 0.997655, 0.017187, 0.999998, 0.587395 | toxic, obscene, insult |
| `I will kill you.` | 0.989043, 0.749215, 0.823909, 0.999988, 0.637390, 0.215818 | toxic, obscene, threat |

## Safe next steps

- Build a representative short conversational/neutral evaluation set and keep
  it separate from model training. Measure per-label false positives and
  preserve recall on valid toxic/threat examples.
- Evaluate candidate training/calibration changes on validation data, then
  confirm on untouched held-out data using the existing production thresholds.
  The current threshold/model comparison report does not support promoting a
  replacement model. Do not change production thresholds based on these five
  hand-picked examples.
- If short, context-poor transcripts need different handling, evaluate an
  explicit uncertainty/human-review outcome rather than adding keyword
  allowlists or discarding high-risk predictions.

No production model, threshold, or moderation behavior was changed in this
investigation. The added tests capture the current artifact and backend
decisions so the reported false positive remains reproducible until a
data-supported model or policy change is evaluated.
