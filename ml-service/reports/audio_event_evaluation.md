# Audio event evaluation

## Status

The YAMNet audio-event path is integrated and covered by contract tests, but it has not been evaluated on a labeled deployment dataset. Precision, recall, and calibration are currently unknown.

## Model and contract

- Artifact: `models/audio/yamnet.onnx`
- SHA-256: `d3835ffbbd4a1bb3e777f0ca217b5007907f5171dd5d17c4236b95b2af8f908e`
- Provenance: `audiomagic/yamnet-onnx`, Apache-2.0
- Input: mono float32 waveform at 16 kHz
- Outputs: 521-class frame scores, 1024-dimensional embeddings, mel spectrogram
- Frame hop: approximately 0.48 seconds
- Frame window: approximately 0.96 seconds
- Maximum analyzed duration: 600 seconds by default
- Default event floor: 0.30

YAMNet outputs class scores, not calibrated event probabilities.

## Policy

| Category | Examples | Severities used |
| --- | --- | --- |
| `explosion` | gunshot, explosion, artillery, fireworks | critical, moderate, low |
| `distress` | screaming, crying, whimpering | high, moderate, low |
| `glass_break` | glass, shattering, smash | high, moderate |
| `fire` | fire sounds | moderate |
| `alarm` | siren, smoke alarm, alarm clock | low |

Severity weights: low 0.35, moderate 0.60, high 0.80, critical 0.95. Only moderate, high, and critical events are actionable for review. Low events are informational.

## Covered by tests

- Silence produces no events.
- Consecutive frames of the same category merge with start/end timestamps and a peak class.
- Different categories remain separate.
- Scores below the confidence floor are ignored.
- Severity-weight risk scores and peak class metadata are produced.
- Source duration beyond the analysis cap is reported as truncated.
- Invalid sample rates and malformed frame scores are rejected.
- The endpoint rejects unsupported, empty, and oversized uploads.

## Required offline evaluation

Build a labeled set that represents the deployment domain. At minimum, include:

- Real gunshots and explosions, including compressed phone audio and distant events.
- Fireworks, cap guns, backfiring vehicles, and other impulsive sounds that are easy false positives.
- Screams in fiction, music, sports, and recreation.
- Glass break, dropped objects, and impact sounds.
- Alarms, sirens, smoke detectors, and industrial noise.
- Long stretches of speech, music, wind, and silence as negatives.
- Multiple simultaneous sounds and overlapping speech.

Report segment-level precision, recall, F1, false positives per hour, and event-level temporal IoU or onset tolerance. Stratify by source device, language/region, background noise, and event distance. Calibrate the confidence floor on a held-out split; do not tune on the test split.

## Known limitations

- The policy is heuristic and based on AudioSet class names.
- Distress and explosion classes are acoustically ambiguous in fiction and recreation.
- Only the first 600 seconds are analyzed by default; later events require a distinct policy.
- The scoring path ignores overlapping non-policy classes except for top-class reporting.
- No threshold should be described as a probability of harmful intent.
