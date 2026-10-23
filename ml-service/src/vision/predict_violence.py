
import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models" / "violence" / "onnx" / "model_int8.onnx"
CONFIG_PATH = ROOT / "models" / "violence" / "source-config" / "config.json"
LABELS_PATH = ROOT / "models" / "violence" / "source-config" / "labels.json"


def load_labels():
    if LABELS_PATH.exists():
        return json.loads(LABELS_PATH.read_text(encoding="utf-8"))

    raise FileNotFoundError(
        f"Missing verified labels file: {LABELS_PATH}. "
        "Create it after confirming the original model's label mapping."
    )


def predict(image_path):
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    path = Path(image_path)
    if not path.is_file():
        raise FileNotFoundError(f"Image not found: {path}")

    labels = load_labels()
    session = ort.InferenceSession(
        str(MODEL_PATH), providers=["CPUExecutionProvider"]
    )

    with Image.open(path) as image:
        image = image.convert("RGB").resize(
            (224, 224), Image.Resampling.BILINEAR
        )
        pixels = np.asarray(image, dtype=np.float32) / 255.0
        pixels = (pixels - 0.5) / 0.5
        pixels = np.transpose(pixels, (2, 0, 1))[None, ...]

    input_name = session.get_inputs()[0].name
    logits = session.run(None, {input_name: pixels})[0][0]

    # Stable softmax converts logits into normalized class scores.
    exp_scores = np.exp(logits - np.max(logits))
    probabilities = exp_scores / exp_scores.sum()

    scores = {
        str(labels[str(i)]): round(float(probabilities[i]), 6)
        for i in range(len(probabilities))
    }

    return {
        "image": str(path),
        "predicted_class": max(scores, key=scores.get),
        "scores": scores,
        "score_type": "softmax class scores",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="Path to an image")
    args = parser.parse_args()
    print(json.dumps(predict(args.image), indent=2))
