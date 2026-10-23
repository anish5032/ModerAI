import asyncio
import sys
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np
from fastapi import HTTPException

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SERVICE_ROOT = PROJECT_ROOT / 'ml-service'
sys.path.insert(0, str(ML_SERVICE_ROOT))

import api  # noqa: E402
from src.audio.events import (  # noqa: E402
    DEFAULT_MIN_CONFIDENCE,
    POLICY,
    SAMPLE_RATE,
    analyze_audio_file,
    analyze_waveform,
    events_from_frame_scores,
    load_class_names,
)


class UploadStub:
    def __init__(self, content, filename='events.wav'):
        self._content = content
        self.content_type = 'audio/wav'
        self.filename = filename

    async def read(self):
        return self._content


def write_silence(path, seconds=1.0):
    samples = np.zeros(int(SAMPLE_RATE * seconds), dtype=np.int16)
    with wave.open(str(path), 'wb') as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(samples.tobytes())


class AudioEventPolicyTests(unittest.TestCase):
    def setUp(self):
        self.class_names = load_class_names()
        self.scores = np.zeros((6, len(self.class_names)), dtype=np.float32)

    def test_silence_does_not_create_events(self):
        self.scores[:, 494] = 0.99

        events = events_from_frame_scores(self.scores, 3.0, self.class_names)

        self.assertEqual(events, [])

    def test_gunshot_frames_merge_into_one_high_priority_event(self):
        self.scores[2, 421] = 0.80
        self.scores[3, 421] = 0.60

        events = events_from_frame_scores(self.scores, 3.0, self.class_names)

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event['category'], 'explosion')
        self.assertEqual(event['severity'], 'critical')
        self.assertEqual(event['startSeconds'], 0.96)
        self.assertEqual(event['endSeconds'], 2.4)
        self.assertEqual(event['frameCount'], 2)
        self.assertEqual(event['score'], 0.80)
        self.assertEqual(event['peakClass'], 'Gunshot or gunfire')
        self.assertEqual(event['peakIndex'], 421)
        self.assertAlmostEqual(event['riskScore'], 0.76)
        self.assertEqual(event['classes'][0]['class'], 'Gunshot or gunfire')

    def test_low_confidence_scores_are_ignored(self):
        self.scores[1, 437] = DEFAULT_MIN_CONFIDENCE - 0.01

        events = events_from_frame_scores(self.scores, 1.0, self.class_names)

        self.assertEqual(events, [])

    def test_different_categories_stay_separate(self):
        self.scores[0, 437] = 0.75
        self.scores[1, 390] = 0.65

        events = events_from_frame_scores(self.scores, 1.5, self.class_names)

        self.assertEqual(
            [event['category'] for event in events],
            ['glass_break', 'alarm'],
        )
        self.assertEqual(
            [event['severity'] for event in events],
            ['high', 'low'],
        )

    def test_invalid_inputs_raise(self):
        with self.assertRaises(ValueError):
            events_from_frame_scores(np.zeros((2, 3)), 1.0, self.class_names)

        with self.assertRaises(ValueError):
            events_from_frame_scores(self.scores, 0, self.class_names)

    def test_policy_covers_weapon_distress_alarm_glass_and_fire(self):
        categories = {category for category, _, _ in POLICY.values()}

        self.assertEqual(
            categories,
            {'explosion', 'distress', 'glass_break', 'alarm', 'fire'},
        )


class AudioEventModelTests(unittest.TestCase):
    def test_silent_wav_produces_no_events_and_model_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            audio_path = Path(directory) / 'silence.wav'
            write_silence(audio_path, 1.5)

            result = analyze_audio_file(str(audio_path))

        self.assertEqual(result['events'], [])
        self.assertEqual(result['riskLevel'], 'safe')
        self.assertEqual(result['riskScore'], 0)
        self.assertEqual(result['model'], 'audiomagic/yamnet-onnx')
        self.assertGreater(result['frameCount'], 0)
        self.assertFalse(result['truncated'])
        self.assertIn('not calibrated', result['scoreType'])

    def test_wrong_sample_rate_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, '16000 Hz'):
            analyze_waveform(np.zeros(1000, dtype=np.float32), sample_rate=8000)

    def test_source_duration_marks_analyzed_audio_as_truncated(self):
        result = analyze_waveform(
            np.zeros(SAMPLE_RATE, dtype=np.float32),
            source_duration=700.0,
        )

        self.assertEqual(result['durationSeconds'], 700.0)
        self.assertEqual(result['analyzedSeconds'], 1.0)
        self.assertTrue(result['truncated'])

    def test_endpoint_returns_audio_events(self):
        with tempfile.TemporaryDirectory() as directory:
            audio_path = Path(directory) / 'silence.wav'
            write_silence(audio_path, 1.0)

            result = asyncio.run(
                api.predict_audio_events(
                    UploadStub(audio_path.read_bytes()),
                    DEFAULT_MIN_CONFIDENCE,
                )
            )

        self.assertEqual(result['filename'], 'events.wav')
        self.assertEqual(result['events'], [])
        self.assertEqual(result['riskLevel'], 'safe')

    def test_endpoint_rejects_unsupported_extension(self):
        upload = UploadStub(b'not-audio', filename='events.txt')

        with self.assertRaises(HTTPException) as caught:
            asyncio.run(api.predict_audio_events(upload, 0.3))

        self.assertEqual(caught.exception.status_code, 400)

    def test_endpoint_rejects_empty_audio(self):
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(api.predict_audio_events(UploadStub(b''), 0.3))

        self.assertEqual(caught.exception.status_code, 400)

    def test_endpoint_rejects_malformed_wav(self):
        upload = UploadStub(b'not-a-valid-wave-file', filename='corrupt.wav')

        with self.assertRaises(HTTPException) as caught:
            asyncio.run(api.predict_audio_events(upload, 0.3))

        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn('Could not decode audio', caught.exception.detail)


if __name__ == '__main__':
    unittest.main()
