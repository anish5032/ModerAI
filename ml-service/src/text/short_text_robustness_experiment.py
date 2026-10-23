from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import Any, Dict, List, Tuple

import pandas as pd
from sklearn.model_selection import train_test_split

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ML_SERVICE_ROOT = PROJECT_ROOT / 'ml-service'
if str(ML_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_SERVICE_ROOT))

from src.text.evaluation_protocol import (  # noqa: E402
    DEFAULT_PRODUCTION_THRESHOLDS,
    LABELS,
    build_model,
    load_processed_dataset,
)
from src.text.text_diagnostic_experiment import (  # noqa: E402
    _format_metrics_table,
    evaluate_scores,
    threshold_predictions,
)

DATASET_PATH = ML_SERVICE_ROOT / 'data' / 'processed' / 'cleaned_train.csv'
REPORT_PATH = ML_SERVICE_ROOT / 'reports' / 'short_text_robustness_evaluation.md'
PRODUCTION_SPLIT_SEED = 42
VALIDATION_SPLIT_SEED = 2026
AUGMENTATION_SOURCE = 'hand-authored fit-only short-text augmentation'

# These fitting prompts teach the model that benign uses of "you"/pronouns do
# not alone imply any of the six labels, while retaining explicit short harms.
TRAINING_EXAMPLES: List[Tuple[str, str]] = [
    ('You.', 'neutral'),
    ('You there?', 'neutral'),
    ('For you?', 'neutral'),
    ('You too?', 'neutral'),
    ('And you?', 'neutral'),
    ('You first.', 'neutral'),
    ('Who, me?', 'neutral'),
    ('Me too.', 'neutral'),
    ('I know.', 'neutral'),
    ('We agree.', 'neutral'),
    ('Are you ready?', 'neutral'),
    ('Can you hear me?', 'neutral'),
    ('Thank you.', 'neutral'),
    ('You sound like a fool.', 'insult'),
    ('You are pathetic.', 'insult'),
    ('You are a jerk.', 'insult'),
    ('That was a stupid thing to say.', 'insult'),
    ('You are a complete moron.', 'insult'),
    ('You are an awful person.', 'insult'),
    ('You are a damn fool.', 'insult_obscene'),
    ('You are full of crap.', 'insult_obscene'),
    ('I will hurt you.', 'threat'),
    ('I am going to attack you.', 'threat'),
    ('I will stab you.', 'threat'),
    ('I am going to shoot you.', 'threat'),
    ('I will make you pay.', 'threat'),
    ('You will regret this; I will hurt you.', 'threat'),
]

# Distinct from all fit-only augmentation prompts. Ground truth is explicit:
# neutral rows are all-negative; insults are toxic+insult; threats are
# toxic+threat. No profanity-only identity-hate or severe-toxicity labels.
VALIDATION_EXAMPLES: List[Tuple[str, str]] = [
    ('You?', 'neutral'),
    ('I?', 'neutral'),
    ('Me?', 'neutral'),
    ('Us?', 'neutral'),
    ('Me, really?', 'neutral'),
    ('Your turn?', 'neutral'),
    ('For us?', 'neutral'),
    ('Am I?', 'neutral'),
    ('Hello, how are you?', 'neutral'),
    ('Thank you for your help.', 'neutral'),
    ('Can you help?', 'neutral'),
    ('Are we there?', 'neutral'),
    ('You are an idiot.', 'insult'),
    ('You are a fool.', 'insult'),
    ('You are worthless.', 'insult'),
    ('Nobody likes you, loser.', 'insult'),
    ('That was a dumb idea.', 'insult'),
    ('You are a nasty jerk.', 'insult'),
    ('This whole thing is bullshit.', 'obscene'),
    ('That was a shitty excuse.', 'obscene'),
    ('I will kill you.', 'threat'),
    ('I will attack you tonight.', 'threat'),
    ('I am going to hurt you.', 'threat'),
    ('I will burn your house down.', 'threat'),
    ('I am going to stab you.', 'threat'),
    ('You will pay; I will come for you.', 'threat'),
]

REGRESSION_INPUTS = [
    'You?',
    'Hello, how are you?',
    'Thank you for your help.',
    'You are an idiot.',
    'I will kill you.',
]


def _labels_for_group(group: str) -> Dict[str, int]:
    labels = {label: 0 for label in LABELS}
    if group in {'insult', 'insult_obscene'}:
        labels['toxic'] = 1
        labels['insult'] = 1
    if group == 'insult_obscene':
        labels['obscene'] = 1
    if group == 'obscene':
        labels['toxic'] = 1
        labels['obscene'] = 1
    if group == 'threat':
        labels['toxic'] = 1
        labels['threat'] = 1
    return labels


def build_short_text_examples(
    examples: List[Tuple[str, str]],
    source_texts: set[str] | None = None,
) -> pd.DataFrame:
    normalized_texts = [text.strip().casefold() for text, _ in examples]
    if len(normalized_texts) != len(set(normalized_texts)):
        raise ValueError('Short-text examples must have unique text.')
    if source_texts and set(normalized_texts) & source_texts:
        raise ValueError('Hand-authored text overlaps the source dataset.')

    return pd.DataFrame([
        {
            'comment_text': text,
            **_labels_for_group(group),
            'group': group,
        }
        for text, group in examples
    ])


def short_text_metrics(
    examples: pd.DataFrame,
    scores: np.ndarray,
) -> Dict[str, Any]:
    return evaluate_scores(examples[LABELS].astype(int), scores)


def run_experiment(output_path: Path = REPORT_PATH) -> Dict[str, Any]:
    dataset = load_processed_dataset(DATASET_PATH)
    development_df, untouched_holdout_df = train_test_split(
        dataset,
        test_size=0.20,
        random_state=PRODUCTION_SPLIT_SEED,
    )
    fit_df, validation_df = train_test_split(
        development_df,
        test_size=0.20,
        random_state=VALIDATION_SPLIT_SEED,
    )

    normalized_source_texts = set(
        dataset['comment_text'].astype(str).str.strip().str.casefold()
    )
    training_examples = build_short_text_examples(
        TRAINING_EXAMPLES,
        normalized_source_texts,
    )
    validation_examples = build_short_text_examples(
        VALIDATION_EXAMPLES,
        normalized_source_texts,
    )
    training_prompt_set = set(
        training_examples['comment_text'].str.casefold()
    )
    validation_prompt_set = set(
        validation_examples['comment_text'].str.casefold()
    )
    if training_prompt_set & validation_prompt_set:
        raise ValueError('Fit-only examples overlap validation prompts.')

    baseline = build_model()
    candidate = build_model()
    fit_text = fit_df['comment_text'].astype(str)
    y_fit = fit_df[LABELS].astype(int)
    validation_text = validation_df['comment_text'].astype(str)
    y_validation = validation_df[LABELS].astype(int)
    baseline.fit(fit_text, y_fit)
    candidate.fit(
        pd.concat([fit_text, training_examples['comment_text']], ignore_index=True),
        pd.concat(
            [y_fit, training_examples[LABELS].astype(int)],
            ignore_index=True,
        ),
    )

    results: Dict[str, Any] = {}
    for name, model in [('baseline', baseline), ('short_text_augmented', candidate)]:
        validation_scores = model.predict_proba(validation_text)
        challenge_scores = model.predict_proba(
            validation_examples['comment_text'].astype(str)
        )
        results[name] = {
            'validation': evaluate_scores(y_validation, validation_scores),
            'short_text_challenge': short_text_metrics(
                validation_examples,
                challenge_scores,
            ),
            'challenge_scores': challenge_scores,
        }

    regression_rows = validation_examples.loc[
        validation_examples['comment_text'].isin(REGRESSION_INPUTS)
    ].copy()
    regression_output = []
    for _, row in regression_rows.iterrows():
        text = row['comment_text']
        item = {
            'text': text,
            'ground_truth_group': row['group'],
            'ground_truth': {label: int(row[label]) for label in LABELS},
        }
        for model_name in results:
            example_index = int(
                validation_examples.index[
                    validation_examples['comment_text'] == text
                ][0]
            )
            scores = results[model_name]['challenge_scores'][example_index]
            item[model_name] = {
                label: round(float(scores[index]), 6)
                for index, label in enumerate(LABELS)
            }
            item[f'{model_name}_detections'] = [
                label for index, label in enumerate(LABELS)
                if item[model_name][label]
                >= DEFAULT_PRODUCTION_THRESHOLDS[label]
            ]
        regression_output.append(item)

    # The held-out 20% is kept completely out of all candidate operations.
    # Its row count is recorded only to make the separation auditable.
    report_data = {
        'development_rows': len(development_df),
        'untouched_holdout_rows': len(untouched_holdout_df),
        'fit_rows': len(fit_df),
        'validation_rows': len(validation_df),
        'augmentation_rows': len(training_examples),
        'validation_example_rows': len(validation_examples),
        'results': results,
        'regression_examples': regression_output,
    }

    lines = [
        '# Short-text robustness experiment',
        '',
        '## Root-cause interpretation',
        '',
        'The production pipeline uses independent, class-weighted one-vs-rest '
        'Logistic Regression classifiers over TF-IDF word uni/bi-grams. The '
        'vectorizer maps `You?` to the single feature `you`; each classifier '
        'therefore scores a context-free token, not the utterance’s intent. '
        'Class weighting and sparse rare-category examples can make these '
        'learned token associations produce extreme outputs. The existing '
        'backend guard is a hand-maintained neutral-pattern exception and does '
        'not match `You?`; adding blanket short-text suppression would also '
        'hide real short threats.',
        '',
        '## Experiment design',
        '',
        '- Baseline: same TF-IDF + One-vs-Rest Logistic Regression architecture '
        'and production thresholds, refit on the candidate fit split.',
        '- Candidate: same architecture and thresholds, plus fit-only '
        'hand-authored examples spanning benign pronoun/conversation snippets, '
        'insults, obscene insults, and threats. There are '
        f'{len(training_examples)} such rows; explicit six-label targets are '
        'attached, and profanity is not labeled severe-toxic or identity-hate.',
        '- Short-text validation challenge consists of '
        f'{len(validation_examples)} distinct hand-authored prompts '
        f'({int((validation_examples["group"] == "neutral").sum())} neutral, '
        f'{int(validation_examples["group"].isin(["insult", "insult_obscene"]).sum())} '
        f'insult, {int((validation_examples["group"] == "obscene").sum())} '
        f'obscene, '
        f'{int((validation_examples["group"] == "threat").sum())} threat). '
        'Threat examples remain positive examples; the experiment has no '
        'short-text bypass.',
        '- Development/untouched split: the existing seed-42 80/20 partition '
        f'has {len(development_df)} development rows and '
        f'{len(untouched_holdout_df)} untouched held-out rows. The held-out '
        '20% is not accessed for scoring, fitting, or candidate decisions.',
        '- The development partition is split 80/20 with seed 2026 into '
        f'{len(fit_df)} fit and {len(validation_df)} validation rows. Both '
        'models train on the same fit rows; only the candidate gets the '
        'augmentation. The hand-authored validation challenge is separate and '
        'has no shared text with augmentation or source data.',
        '- Thresholds are unchanged. This is a validation-only experiment; '
        'neither model nor threshold is promoted or written to a production '
        'artifact.',
        '',
        '## Full corpus validation metrics',
        '',
        '| Model | Macro F1 | Micro F1 | Hamming loss |',
        '| --- | ---: | ---: | ---: |',
    ]
    for name, model_results in results.items():
        metrics = model_results['validation']
        lines.append(
            f"| {name} | {metrics['macro_f1']:.4f} | "
            f"{metrics['micro_f1']:.4f} | {metrics['hamming_loss']:.4f} |"
        )
    for name, model_results in results.items():
        metrics = model_results['validation']
        lines.extend([
            '',
            f'### {name} per-label validation',
            '',
            *_format_metrics_table(metrics),
        ])

    lines.extend([
        '',
        '## Short-text challenge metrics',
        '',
        '| Model | Macro F1 | Micro F1 | Hamming loss |',
        '| --- | ---: | ---: | ---: |',
    ])
    for name, model_results in results.items():
        metrics = model_results['short_text_challenge']
        lines.append(
            f"| {name} | {metrics['macro_f1']:.4f} | "
            f"{metrics['micro_f1']:.4f} | {metrics['hamming_loss']:.4f} |"
        )
    for name, model_results in results.items():
        metrics = model_results['short_text_challenge']
        lines.extend([
            '',
            f'### {name} per-label short-text challenge',
            '',
            *_format_metrics_table(metrics),
        ])

    lines.extend([
        '',
        '## Existing regression examples',
        '',
        'Each score object contains the six model outputs in named form. '
        'Detections use the configured production thresholds.',
        '',
        '| Text | Ground truth | Baseline detections | Candidate detections |',
        '| --- | --- | --- | --- |',
    ])
    for item in regression_output:
        baseline_labels = ', '.join(item['baseline_detections']) or 'none'
        candidate_labels = ', '.join(item['short_text_augmented_detections']) or 'none'
        lines.append(
            f"| {item['text']} | {item['ground_truth_group']} | "
            f"{baseline_labels} | {candidate_labels} |"
        )
    lines.extend([
        '',
        'Named raw scores for the same regression prompts:',
        '',
        '| Text | Model | toxic | severe_toxic | obscene | threat | insult | identity_hate |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ])
    for item in regression_output:
        for model_name in ['baseline', 'short_text_augmented']:
            score_values = item[model_name]
            lines.append(
                f"| {item['text']} | {model_name} | "
                + ' | '.join(
                    f'{score_values[label]:.6f}' for label in LABELS
                )
                + ' |'
            )

    baseline_challenge = results['baseline']['short_text_challenge']
    candidate_challenge = results['short_text_augmented']['short_text_challenge']
    baseline_threat = next(
        item for item in baseline_challenge['per_label']
        if item['label'] == 'threat'
    )
    candidate_threat = next(
        item for item in candidate_challenge['per_label']
        if item['label'] == 'threat'
    )
    neutral_mask = validation_examples['group'].eq('neutral').to_numpy()
    baseline_neutral_false_positives = int(threshold_predictions(
        results['baseline']['challenge_scores'][neutral_mask]
    ).sum())
    candidate_neutral_false_positives = int(threshold_predictions(
        results['short_text_augmented']['challenge_scores'][neutral_mask]
    ).sum())
    lines.extend([
        '',
        '## Interpretation and limitations',
        '',
        f'- Neutral challenge false-positive label count: baseline '
        f'{baseline_neutral_false_positives}; candidate '
        f'{candidate_neutral_false_positives}. These are counts of individual '
        'label false alarms across the neutral examples, not a population rate.',
        f'- Short-threat recall: baseline {baseline_threat["recall"]:.3f} '
        f'({baseline_threat["tp"]}/{baseline_threat["support"]}); candidate '
        f'{candidate_threat["recall"]:.3f} '
        f'({candidate_threat["tp"]}/{candidate_threat["support"]}).',
        '- Hand-authored prompts are a small, curated challenge set; labels '
        'represent the authors’ intended meaning, and model performance does '
        'not generalize to all conversational dialects, sarcasm, quoted '
        'speech, or transcription errors.',
        '- Severe-toxic and identity-hate have no positive examples in this '
        'hand-authored challenge, so those challenge-set recall/F1 values are '
        'not meaningful. Their performance is still measured on the full '
        'Jigsaw validation split; the curated labels avoid inventing '
        'identity-hate or severe-toxicity ground truth.',
        '- The candidate is only one augmentation recipe. Its short challenge '
        'is specifically aligned to that recipe; broad balanced conversational '
        'data and independently authored evaluation are needed before any '
        'deployment proposal.',
        '- The full validation table checks for regressions on the existing '
        'distribution. A candidate gain on the curated set alone is '
        'insufficient. The seed-42 held-out 20% remains untouched and must be '
        'reserved for a later pre-registered final evaluation.',
        '',
        '## Reproduction',
        '',
        'From the repository root:',
        '',
        '```powershell',
        '& .\\ml-service\\.venv\\Scripts\\python.exe '
        'ml-service\\src\\text\\short_text_robustness_experiment.py',
        '& .\\ml-service\\.venv\\Scripts\\python.exe -m unittest discover '
        '-s ml-service\\tests -v',
        'node --test backend\\tests\\analysisService.test.js '
        'backend\\tests\\videoRiskScore.test.js',
        '```',
        '',
        'This script does not alter backend short-text handling, thresholds, '
        'production model artifacts, or moderation event behavior.',
    ])

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return report_data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=REPORT_PATH)
    args = parser.parse_args()
    report = run_experiment(args.output)
    print(f"Report: {args.output.resolve()}")
    print(
        f"Rows: fit={report['fit_rows']} validation={report['validation_rows']} "
        f"short challenge={report['validation_example_rows']} "
        f"untouched holdout={report['untouched_holdout_rows']}"
    )
    for model_name, model_results in report['results'].items():
        print(
            f"{model_name}: "
            f"corpus macro-F1={model_results['validation']['macro_f1']:.4f}, "
            f"challenge macro-F1="
            f"{model_results['short_text_challenge']['macro_f1']:.4f}"
        )
        for metric in model_results['short_text_challenge']['per_label']:
            print(
                f"  {metric['label']}: P={metric['precision']:.3f} "
                f"R={metric['recall']:.3f} F1={metric['f1']:.3f} "
                f"FP={metric['fp']}"
            )


if __name__ == '__main__':
    main()
