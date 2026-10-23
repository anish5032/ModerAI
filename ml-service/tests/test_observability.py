import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SERVICE_ROOT = PROJECT_ROOT / 'ml-service'
sys.path.insert(0, str(ML_SERVICE_ROOT))

from src import observability  # noqa: E402


class ObservabilityTests(unittest.TestCase):
    def test_prediction_log_omits_raw_content(self):
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / 'predictions.jsonl'

            with patch.dict(
                os.environ,
                {'PREDICTION_LOG_PATH': str(log_path)},
            ):
                observability.log_prediction(
                    '/predict/text',
                    'test-model',
                    scores={'toxic': 0.123456789},
                    flags=['toxic'],
                    details={
                        'text': 'private transcript',
                        'transcript': 'private transcript',
                        'filename': 'private.mp4',
                        'characterCount': 17,
                    },
                )

            record = json.loads(log_path.read_text(encoding='utf-8'))

        self.assertEqual(record['type'], 'prediction')
        self.assertEqual(record['scores']['toxic'], 0.123457)
        self.assertEqual(record['details'], {'characterCount': 17})
        raw = json.dumps(record)
        self.assertNotIn('private transcript', raw)
        self.assertNotIn('private.mp4', raw)

    def test_error_log_does_not_include_exception_message(self):
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / 'predictions.jsonl'

            with patch.dict(
                os.environ,
                {'PREDICTION_LOG_PATH': str(log_path)},
            ):
                observability.log_error(
                    '/predict/vision',
                    ValueError('sensitive frame content'),
                    400,
                )

            record = json.loads(log_path.read_text(encoding='utf-8'))

        self.assertEqual(record['errorType'], 'ValueError')
        self.assertEqual(record['status'], 400)
        self.assertNotIn('sensitive frame content', json.dumps(record))


if __name__ == '__main__':
    unittest.main()
