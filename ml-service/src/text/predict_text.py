
from pathlib import Path
import joblib

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = PROJECT_ROOT / "models" / "text_toxicity_model.joblib"


def main():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    saved = joblib.load(MODEL_PATH)
    model = saved["model"]
    labels = saved["labels"]

    comments = [
        "Thank you for helping me with this project.",
        "You are an idiot and nobody likes you.",
        "I disagree with your opinion, but I respect it.",
    ]

    probabilities = model.predict_proba(comments)

    for comment, scores in zip(comments, probabilities):
        print("\nComment:", comment)
        print("Toxicity scores:")

        for label, score in zip(labels, scores):
            print(f"  {label:15s}: {score:.3f}")


if __name__ == "__main__":
    main()
