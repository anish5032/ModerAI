
import argparse
from pathlib import Path

import onnxruntime as ort
from PIL import Image
from huggingface_hub import hf_hub_download

try:
    from .preprocessing import preprocess_image
except ImportError:
    from preprocessing import preprocess_image

LABELS = ["NSFL", "NSFW", "SFW"]
ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models" / "vision" / "onnx" / "image-safety-classifier-xs.onnx"


def load_model():
    if not MODEL_PATH.exists():
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        downloaded = hf_hub_download(
            repo_id="OwenElliott/image-safety-classifier-xs",
            filename="onnx/image-safety-classifier-xs.onnx",
            local_dir=str(ROOT / "models" / "vision"),
        )
        print(f"Downloaded model: {downloaded}")

    session = ort.InferenceSession(
        str(MODEL_PATH),
        providers=["CPUExecutionProvider"],
    )
    return session


def predict_image(image_path: str):
    path = Path(image_path)
    if not path.is_file():
        raise FileNotFoundError(f"Image not found: {path}")

    with Image.open(path) as image:
        pixels = preprocess_image(image)

    session = load_model()
    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: pixels})[0][0]

    scores = {label: round(float(score), 6) for label, score in zip(LABELS, output)}
    predicted = max(scores, key=scores.get)

    return {
        "image": str(path),
        "predicted_class": predicted,
        "scores": scores,
        "label_order": LABELS,
        "score_type": "class probability (softmax included in exported model)",
        "preprocessing": "RGB, bilinear resize to 224x224, pixel range 0-255",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ModerAI vision safety prediction")
    parser.add_argument("image", help="Path to a local image")
    args = parser.parse_args()

    result = predict_image(args.image)
    print(result)
