from __future__ import annotations

from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import joblib  # noqa: E402
import onnxruntime as ort  # noqa: E402

from src.audio.events import POLICY, load_class_names  # noqa: E402

MANIFEST_PATH = ROOT / "models" / "model_manifest.json"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def check_asset(root, relative_path, expected_sha256, expected_bytes, errors):
    path = root / relative_path
    if not path.is_file():
        errors.append(f"missing file: {relative_path}")
        return None

    actual_bytes = path.stat().st_size
    if expected_bytes is not None and actual_bytes != expected_bytes:
        errors.append(
            f"size mismatch for {relative_path}: "
            f"expected {expected_bytes}, found {actual_bytes}"
        )

    actual_sha256 = sha256(path)
    if actual_sha256 != expected_sha256.lower():
        errors.append(
            f"sha256 mismatch for {relative_path}: "
            f"expected {expected_sha256}, found {actual_sha256}"
        )

    return path


def validate_text(root, spec, errors):
    path = check_asset(
        root,
        spec["path"],
        spec["sha256"],
        spec.get("bytes"),
        errors,
    )
    if path is None:
        return

    try:
        saved = joblib.load(path)
    except Exception as exc:
        errors.append(f"could not load text model: {type(exc).__name__}")
        return

    if not isinstance(saved, dict) or "model" not in saved or "labels" not in saved:
        errors.append("text model must contain model and labels entries")
        return

    if list(saved["labels"]) != list(spec["labels"]):
        errors.append("text model labels do not match the manifest")
    if not hasattr(saved["model"], "predict_proba"):
        errors.append("text model does not expose predict_proba")


def validate_vision(root, spec, errors):
    path = check_asset(
        root,
        spec["path"],
        spec["sha256"],
        spec.get("bytes"),
        errors,
    )
    if path is None:
        return

    session = ort.InferenceSession(
        str(path),
        providers=["CPUExecutionProvider"],
    )
    inputs = session.get_inputs()
    outputs = session.get_outputs()
    labels = list(spec["labels"])

    if len(inputs) != 1:
        errors.append("vision model must have exactly one input")
        return
    if len(inputs[0].shape) != 4 or inputs[0].shape[1:] != [3, 224, 224]:
        errors.append(f"unexpected vision input shape: {inputs[0].shape}")
    if len(outputs) != 1 or outputs[0].shape[-1] != len(labels):
        errors.append("vision output does not match the configured labels")


def validate_audio(root, spec, errors):
    path = check_asset(
        root,
        spec["path"],
        spec["sha256"],
        spec.get("bytes"),
        errors,
    )
    check_asset(
        root,
        spec["classMapPath"],
        spec["classMapSha256"],
        None,
        errors,
    )
    if path is None:
        return

    session = ort.InferenceSession(
        str(path),
        providers=["CPUExecutionProvider"],
    )
    inputs = session.get_inputs()
    outputs = session.get_outputs()

    if len(inputs) != 1 or len(inputs[0].shape) != 1:
        errors.append("audio model must accept one 1-D waveform input")
    if len(outputs) < 2:
        errors.append("audio model must expose scores and embeddings")
    elif outputs[0].shape[-1] != spec["classCount"]:
        errors.append("audio score output does not match the class count")

    class_names = load_class_names()
    if len(class_names) != spec["classCount"]:
        errors.append(
            f"class map has {len(class_names)} classes, "
            f"expected {spec['classCount']}"
        )
    invalid_policy = [
        index
        for index in POLICY
        if index < 0 or index >= len(class_names)
    ]
    if invalid_policy:
        errors.append(f"policy references invalid class indices: {invalid_policy}")


def main():
    if not MANIFEST_PATH.is_file():
        print(f"FAIL: manifest not found: {MANIFEST_PATH}")
        return 1

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    models = manifest.get("models", {})
    errors = []

    validators = {
        "text": validate_text,
        "vision": validate_vision,
        "audio": validate_audio,
    }

    for name, spec in models.items():
        validator = validators.get(name)
        if validator is None:
            errors.append(f"no validator for model type: {name}")
            continue
        before = len(errors)
        try:
            validator(ROOT, spec, errors)
        except Exception as exc:
            errors.append(f"{name} validation crashed: {type(exc).__name__}")
        if len(errors) == before:
            print(f"OK: {name} ({spec['path']})")

    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1

    print("All model artifacts match the manifest.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
