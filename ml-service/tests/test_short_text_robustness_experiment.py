import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / 'ml-service'))

from src.text.evaluation_protocol import LABELS  # noqa: E402
from src.text.short_text_robustness_experiment import (  # noqa: E402
    TRAINING_EXAMPLES,
    VALIDATION_EXAMPLES,
    build_short_text_examples,
)


class ShortTextRobustnessExperimentTests(unittest.TestCase):
    def test_fit_and_validation_prompts_are_disjoint(self):
        training = build_short_text_examples(TRAINING_EXAMPLES)
        validation = build_short_text_examples(VALIDATION_EXAMPLES)

        self.assertFalse(
            set(training['comment_text'].str.casefold())
            & set(validation['comment_text'].str.casefold())
        )

    def test_training_includes_neutral_and_positive_short_threat_examples(self):
        training = build_short_text_examples(TRAINING_EXAMPLES)
        neutral = training.loc[training['group'] == 'neutral']
        threats = training.loc[training['group'] == 'threat']

        self.assertGreater(len(neutral), 0)
        self.assertTrue((neutral[LABELS] == 0).all().all())
        self.assertGreater(len(threats), 0)
        self.assertTrue((threats['threat'] == 1).all())
        self.assertTrue((threats['toxic'] == 1).all())
        self.assertTrue((threats['severe_toxic'] == 0).all())
        self.assertTrue((threats['identity_hate'] == 0).all())

    def test_validation_labels_do_not_equate_insults_or_threats_with_other_labels(self):
        validation = build_short_text_examples(VALIDATION_EXAMPLES)
        insult = validation.loc[
            validation['comment_text'] == 'You are an idiot.'
        ].iloc[0]
        obscene = validation.loc[
            validation['comment_text'] == 'This whole thing is bullshit.'
        ].iloc[0]
        threat = validation.loc[
            validation['comment_text'] == 'I will kill you.'
        ].iloc[0]

        self.assertEqual((insult['toxic'], insult['insult']), (1, 1))
        self.assertEqual(insult['severe_toxic'], 0)
        self.assertEqual(insult['identity_hate'], 0)
        self.assertEqual((obscene['toxic'], obscene['obscene']), (1, 1))
        self.assertEqual(obscene['insult'], 0)
        self.assertEqual(obscene['severe_toxic'], 0)
        self.assertEqual(obscene['identity_hate'], 0)
        self.assertEqual((threat['toxic'], threat['threat']), (1, 1))
        self.assertEqual(threat['severe_toxic'], 0)
        self.assertEqual(threat['identity_hate'], 0)

    def test_prompt_builder_rejects_overlap_with_source_corpus(self):
        with self.assertRaisesRegex(ValueError, 'overlaps the source dataset'):
            build_short_text_examples(
                [('Safe phrase.', 'neutral')],
                {'safe phrase.'},
            )

    def test_candidate_training_data_keeps_short_threats_positive(self):
        training = build_short_text_examples(TRAINING_EXAMPLES)
        validation = build_short_text_examples(VALIDATION_EXAMPLES)
        validation_threats = validation.loc[validation['group'] == 'threat']
        training_neutral = training.loc[training['group'] == 'neutral']

        self.assertTrue((validation_threats['threat'] == 1).all())
        self.assertGreater(len(training_neutral), 0)
        self.assertTrue((training_neutral[LABELS] == 0).all().all())
        self.assertEqual(
            set(training['comment_text'].str.casefold())
            & set(validation['comment_text'].str.casefold()),
            set(),
        )


if __name__ == '__main__':
    unittest.main()
