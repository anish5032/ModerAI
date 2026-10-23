import csv
import shutil
import subprocess
import threading
from pathlib import Path

import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models" / "audio" / "yamnet.onnx"
CLASS_MAP_PATH = ROOT / "models" / "audio" / "yamnet_class_map.csv"
MODEL_ID = "audiomagic/yamnet-onnx"
MODEL_LICENSE = "Apache-2.0"
SAMPLE_RATE = 16000
FRAME_HOP_SECONDS = 0.48
FRAME_WINDOW_SECONDS = 0.96
DEFAULT_MIN_CONFIDENCE = 0.30
MAX_ANALYZED_SECONDS = 600

SEVERITY_RANK = {
    "safe": 0,
    "low": 1,
    "moderate": 2,
    "high": 3,
    "critical": 4,
}

SEVERITY_WEIGHT = {
    "low": 0.35,
    "moderate": 0.60,
    "high": 0.80,
    "critical": 0.95,
}

POLICY = {
    11: ("distress", "Screaming", "high"),
    19: ("distress", "Crying or sobbing", "moderate"),
    20: ("distress", "Baby cry or infant cry", "moderate"),
    21: ("distress", "Whimpering", "low"),
    22: ("distress", "Wailing or moaning", "low"),
    292: ("fire", "Fire sounds", "moderate"),
    304: ("alarm", "Car alarm", "low"),
    317: ("alarm", "Police siren", "low"),
    318: ("alarm", "Ambulance siren", "low"),
    319: ("alarm", "Fire engine siren", "low"),
    382: ("alarm", "Alarm", "low"),
    389: ("alarm", "Alarm clock", "low"),
    390: ("alarm", "Siren", "low"),
    391: ("alarm", "Civil defense siren", "low"),
    393: ("alarm", "Smoke detector or smoke alarm", "low"),
    394: ("alarm", "Fire alarm", "low"),
    420: ("explosion", "Explosion", "critical"),
    421: ("explosion", "Gunshot or gunfire", "critical"),
    422: ("explosion", "Machine gun", "critical"),
    424: ("explosion", "Artillery fire", "critical"),
    425: ("explosion", "Cap gun", "low"),
    426: ("explosion", "Fireworks", "moderate"),
    427: ("explosion", "Firecracker", "moderate"),
    428: ("explosion", "Burst or pop", "low"),
    430: ("explosion", "Boom", "low"),
    435: ("glass_break", "Glass sound", "moderate"),
    437: ("glass_break", "Shattering", "high"),
    463: ("glass_break", "Smash or crash", "moderate"),
}

CATEGORY_LABELS = {
    "explosion": "Weapon or explosion-like sound",
    "distress": "Scream or distress vocalization",
    "glass_break": "Glass break or impact",
    "fire": "Fire sound",
    "alarm": "Alarm or siren",
}

CATEGORY_DESCRIPTIONS = {
    "explosion": (
        "Possible gunfire, explosion, or a similar sharp impact. "
        "Fireworks and cap guns can share acoustics; review the context."
    ),
    "distress": (
        "Possible screaming or crying. Distress sounds can also occur in "
        "fiction, music, or recreation; review the context."
    ),
    "glass_break": (
        "Possible breaking glass or a violent impact; review the context."
    ),
    "fire": "Possible fire or burning sounds; review the context.",
    "alarm": (
        "Environmental alarm or siren. Usually informational rather than "
        "evidence of harmful content."
    ),
}


class AudioEventError(RuntimeError):
    pass


class _Model:
    def __init__(self):
        self._session = None
        self._lock = threading.Lock()
        self._class_names = None
        self._input_name = None

    def load(self):
        with self._lock:
            if self._session is None:
                if not MODEL_PATH.is_file():
                    raise AudioEventError(f"YAMNet model not found: {MODEL_PATH}")
                if not CLASS_MAP_PATH.is_file():
                    raise AudioEventError(
                        f"YAMNet class map not found: {CLASS_MAP_PATH}"
                    )
                self._session = ort.InferenceSession(
                    str(MODEL_PATH),
                    providers=["CPUExecutionProvider"],
                )
                self._input_name = self._session.get_inputs()[0].name
                self._class_names = load_class_names()
        return self._session, self._input_name, self._class_names

    def run(self, waveform):
        session, input_name, class_names = self.load()
        with self._lock:
            outputs = session.run(None, {input_name: waveform})
        if len(outputs) < 2:
            raise AudioEventError("YAMNet returned an unexpected output shape.")
        frame_scores = np.asarray(outputs[0], dtype=np.float32)
        embeddings = np.asarray(outputs[1], dtype=np.float32)
        if frame_scores.ndim != 2 or frame_scores.shape[1] != len(class_names):
            raise AudioEventError("YAMNet returned an unexpected score shape.")
        return frame_scores, embeddings, class_names


model = _Model()


def load_class_names():
    with CLASS_MAP_PATH.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    names = [None] * len(rows)
    for row in rows:
        names[int(row["index"])] = row["display_name"]
    if any(name is None for name in names):
        raise AudioEventError("YAMNet class map is incomplete.")
    return names


def probe_duration(path):
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None

    command = [
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    try:
        completed = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if completed.returncode != 0:
        return None

    try:
        duration = float(completed.stdout.decode("utf-8", errors="replace").strip())
    except ValueError:
        return None

    return duration if np.isfinite(duration) and duration > 0 else None


def decode_audio(path, sample_rate=SAMPLE_RATE):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise AudioEventError(
            "FFmpeg is required to decode audio for event analysis."
        )

    source_duration = probe_duration(path)

    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(path),
        "-vn",
        "-t",
        str(MAX_ANALYZED_SECONDS),
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "pipe:1",
    ]
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=120,
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise AudioEventError(
            f"Could not decode audio: {detail or 'FFmpeg failed.'}"
        )
    waveform = np.frombuffer(completed.stdout, dtype="<f4").astype(np.float32)
    if waveform.size == 0:
        raise AudioEventError("Decoded audio contains no samples.")
    if not np.all(np.isfinite(waveform)):
        raise AudioEventError("Decoded audio contains invalid samples.")
    return waveform, sample_rate, source_duration


def timecode(seconds):
    value = max(0, int(seconds))
    return (
        f"{value // 3600:02d}:"
        f"{(value % 3600) // 60:02d}:"
        f"{value % 60:02d}"
    )


def policy_for_index(index):
    return POLICY.get(int(index))


def events_from_frame_scores(
    frame_scores,
    duration_seconds,
    class_names,
    min_confidence=DEFAULT_MIN_CONFIDENCE,
):
    scores = np.asarray(frame_scores, dtype=np.float32)
    if scores.ndim != 2 or scores.shape[1] != len(class_names):
        raise ValueError("Frame scores do not match the YAMNet class map.")
    if not np.all(np.isfinite(scores)):
        raise ValueError("Frame scores contain invalid values.")
    if not np.isfinite(duration_seconds) or duration_seconds <= 0:
        raise ValueError("A positive audio duration is required.")

    policy_indices = np.array(sorted(POLICY), dtype=np.int64)
    policy_scores = scores[:, policy_indices]
    best_positions = policy_scores.argmax(axis=1)
    best_scores = policy_scores[np.arange(len(scores)), best_positions]
    best_indices = policy_indices[best_positions]

    candidates = []
    for frame_index, (score, class_index) in enumerate(
        zip(best_scores, best_indices)
    ):
        if float(score) < min_confidence:
            candidates.append(None)
            continue
        category, class_label, severity = POLICY[int(class_index)]
        start = round(frame_index * FRAME_HOP_SECONDS, 3)
        if start >= duration_seconds:
            break
        candidates.append(
            {
                "category": category,
                "class": class_label,
                "index": int(class_index),
                "score": round(float(score), 6),
                "severity": severity,
                "start": start,
            }
        )

    events = []
    current = None
    for frame_index, candidate in enumerate(candidates):
        if candidate is None:
            if current is not None:
                events.append(current)
                current = None
            continue

        start = frame_index * FRAME_HOP_SECONDS
        end = min(duration_seconds, start + FRAME_WINDOW_SECONDS)

        if current and current["category"] == candidate["category"]:
            current["endSeconds"] = round(end, 3)
            current["frameCount"] += 1
            current["classes"].append(
                {
                    "class": candidate["class"],
                    "index": candidate["index"],
                    "score": candidate["score"],
                }
            )
            if SEVERITY_RANK[candidate["severity"]] > SEVERITY_RANK[
                current["severity"]
            ]:
                current["severity"] = candidate["severity"]
            if candidate["score"] > current["peak"]["score"]:
                current["peak"] = {
                    "class": candidate["class"],
                    "index": candidate["index"],
                    "score": candidate["score"],
                }
            continue

        if current is not None:
            events.append(current)

        current = {
            "category": candidate["category"],
            "label": CATEGORY_LABELS[candidate["category"]],
            "description": CATEGORY_DESCRIPTIONS[candidate["category"]],
            "severity": candidate["severity"],
            "startSeconds": candidate["start"],
            "endSeconds": round(end, 3),
            "frameCount": 1,
            "peak": {
                "class": candidate["class"],
                "index": candidate["index"],
                "score": candidate["score"],
            },
            "classes": [
                {
                    "class": candidate["class"],
                    "index": candidate["index"],
                    "score": candidate["score"],
                }
            ],
        }

    if current is not None:
        events.append(current)

    for event in events:
        unique = {}
        for item in event.pop("classes"):
            previous = unique.get(item["class"])
            if previous is None or item["score"] > previous["score"]:
                unique[item["class"]] = item
        event["classes"] = sorted(
            unique.values(),
            key=lambda item: item["score"],
            reverse=True,
        )[:5]
        peak = event.pop("peak")
        event["score"] = peak["score"]
        event["peakClass"] = peak["class"]
        event["peakIndex"] = peak["index"]
        event["riskScore"] = round(
            event["score"] * SEVERITY_WEIGHT[event["severity"]],
            4,
        )
        event["timecode"] = timecode(event["startSeconds"])
        event["model"] = MODEL_ID
        event["source"] = "yamnet"

    return events


def score_summary(frame_scores, class_names, limit=5):
    scores = np.asarray(frame_scores, dtype=np.float32)
    if scores.size == 0:
        return []
    peak = scores.max(axis=0)
    top_indices = np.argsort(peak)[::-1][:limit]
    return [
        {
            "index": int(index),
            "class": class_names[int(index)],
            "score": round(float(peak[index]), 6),
        }
        for index in top_indices
    ]


def analyze_waveform(
    waveform,
    sample_rate=SAMPLE_RATE,
    min_confidence=DEFAULT_MIN_CONFIDENCE,
    source_duration=None,
):
    samples = np.asarray(waveform, dtype=np.float32).reshape(-1)
    if samples.size == 0:
        raise AudioEventError("Audio contains no samples.")
    if sample_rate != SAMPLE_RATE:
        raise AudioEventError(
            f"YAMNet requires {SAMPLE_RATE} Hz audio; received {sample_rate} Hz."
        )
    if not np.all(np.isfinite(samples)):
        raise AudioEventError("Audio contains invalid samples.")

    decoded_duration = len(samples) / SAMPLE_RATE
    duration = (
        float(source_duration)
        if source_duration is not None
        and np.isfinite(source_duration)
        and source_duration > 0
        else decoded_duration
    )
    analyzed_duration = min(decoded_duration, MAX_ANALYZED_SECONDS)
    analyzed_samples = samples[: int(analyzed_duration * SAMPLE_RATE)]

    frame_scores, embeddings, class_names = model.run(analyzed_samples)
    events = events_from_frame_scores(
        frame_scores,
        analyzed_duration,
        class_names,
        min_confidence=min_confidence,
    )

    highest = "safe"
    for event in events:
        if SEVERITY_RANK[event["severity"]] > SEVERITY_RANK[highest]:
            highest = event["severity"]

    return {
        "events": events,
        "riskLevel": highest,
        "riskScore": round(
            max((event["riskScore"] for event in events), default=0.0),
            4,
        ),
        "topClasses": score_summary(frame_scores, class_names),
        "durationSeconds": round(duration, 3),
        "analyzedSeconds": round(analyzed_duration, 3),
        "truncated": duration > analyzed_duration + 0.05,
        "frameCount": int(frame_scores.shape[0]),
        "embeddingShape": list(embeddings.shape),
        "model": MODEL_ID,
        "modelLicense": MODEL_LICENSE,
        "scoreType": (
            "YAMNet class score (not calibrated; not an event probability)"
        ),
        "minConfidence": min_confidence,
        "frameHopSeconds": FRAME_HOP_SECONDS,
        "frameWindowSeconds": FRAME_WINDOW_SECONDS,
        "policy": {
            category: {
                "label": label,
                "description": CATEGORY_DESCRIPTIONS[category],
                "classes": [
                    {
                        "index": index,
                        "class": class_label,
                        "severity": severity,
                    }
                    for index, (mapped, class_label, severity) in sorted(
                        POLICY.items()
                    )
                    if mapped == category
                ],
            }
            for category, label in CATEGORY_LABELS.items()
        },
        "note": (
            "Audio events are separate from speech transcription and are not "
            "proof of harmful intent. YAMNet scores are not calibrated; review "
            "the surrounding context."
        ),
    }


def analyze_audio_file(path, min_confidence=DEFAULT_MIN_CONFIDENCE):
    waveform, sample_rate, source_duration = decode_audio(path)
    return analyze_waveform(
        waveform,
        sample_rate=sample_rate,
        min_confidence=min_confidence,
        source_duration=source_duration,
    )
