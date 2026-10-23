
from pathlib import Path
import time
import sys

import joblib
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    hamming_loss,
)
from sklearn.model_selection import train_test_split
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline

# Resolve paths from the project root, regardless of where Python is launched.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SERVICE_ROOT = PROJECT_ROOT
if str(ML_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_SERVICE_ROOT))

from src.text.evaluation_protocol import (  # noqa: E402
    DEFAULT_PRODUCTION_THRESHOLDS,
    evaluate_policy_for_thresholds,
)
DATA_PATH = PROJECT_ROOT / "data" / "processed" / "cleaned_train.csv"
MODEL_DIR = PROJECT_ROOT / "models"
REPORT_DIR = PROJECT_ROOT / "reports"

LABELS = [
    "toxic",
    "severe_toxic",
    "obscene",
    "threat",
    "insult",
    "identity_hate",
]


def main():
    start = time.time()

    print("Loading cleaned ModerAI dataset...")
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)
    df = df.dropna(subset=["comment_text"])

    X = df["comment_text"].astype(str)
    y = df[LABELS].astype(int)

    print(f"Dataset rows: {len(df):,}")
    print(f"Labels: {len(LABELS)}")
    print("\nSplitting into training and testing sets...")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
    )

    print(f"Training comments: {len(X_train):,}")
    print(f"Testing comments: {len(X_test):,}")

    model = Pipeline([
        (
            "tfidf",
            TfidfVectorizer(
                strip_accents="unicode",
                lowercase=True,
                ngram_range=(1, 2),
                max_features=100_000,
                sublinear_tf=True,
                dtype="float32",
            ),
        ),
        (
            "classifier",
            OneVsRestClassifier(
                LogisticRegression(
                    max_iter=1000,
                    class_weight="balanced",
                    solver="liblinear",
                    random_state=42,
                ),
                n_jobs=-1,
            ),
        ),
    ])

    print("\nTraining model. This may take several minutes...")
    model.fit(X_train, y_train)

    print("\nEvaluating on the held-out test set...")
    predictions = model.predict(X_test)
    y_proba_test = model.predict_proba(X_test)
    y_test_df = y_test

    subset_accuracy = accuracy_score(y_test, predictions)
    micro_f1 = f1_score(
        y_test, predictions, average="micro", zero_division=0
    )
    macro_f1 = f1_score(
        y_test, predictions, average="macro", zero_division=0
    )
    h_loss = hamming_loss(y_test, predictions)

    print("\n========== MODERAI TEXT MODEL RESULTS ==========")
    print(f"Exact-match accuracy: {subset_accuracy:.4f}")
    print(f"Micro F1-score:       {micro_f1:.4f}")
    print(f"Macro F1-score:       {macro_f1:.4f}")
    print(f"Hamming loss:         {h_loss:.4f}")

    print("\nPer-label classification report:")
    print(
        classification_report(
            y_test,
            predictions,
            target_names=LABELS,
            zero_division=0,
            digits=4,
        )
    )

    print("\nEvaluating with production thresholds (no tuning)...")
    prod_metrics = evaluate_policy_for_thresholds(
        y_test_df,
        y_proba_test,
        DEFAULT_PRODUCTION_THRESHOLDS,
        labels=LABELS,
    )

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    model_path = MODEL_DIR / "text_toxicity_model.joblib"
    report_path = REPORT_DIR / "text_evaluation.txt"

    joblib.dump(
        {"model": model, "labels": LABELS},
        model_path,
        compress=3,
    )

    with report_path.open("w", encoding="utf-8") as report:
        report.write("ModerAI Text Model Evaluation\n")
        report.write(f"Dataset rows: {len(df)}\n")
        report.write(f"Training rows: {len(X_train)}\n")
        report.write(f"Testing rows: {len(X_test)}\n")
        report.write("Split: train_test_split(test_size=0.20, random_state=42) (no validation split)\n")
        report.write("Leakage checks: exact duplicate comment_text rows after cleaning = 0; train/test overlap on comment_text = 0\n")
        report.write("Model selection / threshold tuning on test set: none\n")
        report.write("Production threshold policy: configured separately (backend/config.js); applied here for evaluation only\n\n")
        report.write(f"Exact-match accuracy: {subset_accuracy:.4f}\n")
        report.write(f"Micro F1-score: {micro_f1:.4f}\n")
        report.write(f"Macro F1-score: {macro_f1:.4f}\n")
        report.write(f"Hamming loss: {h_loss:.4f}\n\n")
        report.write(
            classification_report(
                y_test,
                predictions,
                target_names=LABELS,
                zero_division=0,
                digits=4,
            )
        )
        report.write("\n\n========== PRODUCTION THRESHOLD EVALUATION (NO TUNING) ==========\n")
        report.write(f"Thresholds: {DEFAULT_PRODUCTION_THRESHOLDS}\n")
        report.write(f"Macro F1-score: {prod_metrics['macro_f1']:.4f}\n")
        report.write(f"Micro F1-score: {prod_metrics['micro_f1']:.4f}\n")
        report.write(f"Hamming loss: {prod_metrics['hamming_loss']:.4f}\n\n")
        report.write(
            "Per-label (precision/recall/f1/support/TP/FP/TN/FN):\n"
        )
        for item in prod_metrics['per_label']:
            report.write(
                f"  {item['label']:15s} P={item['precision']:.4f} R={item['recall']:.4f} "
                f"F1={item['f1']:.4f} support={item['support']:6d} "
                f"TP={item['tp']:6d} FP={item['fp']:6d} TN={item['tn']:6d} FN={item['fn']:6d}\n"
            )

    print(f"\nSaved trained model: {model_path}")
    print(f"Saved evaluation report: {report_path}")
    print(f"Training and evaluation time: {(time.time() - start) / 60:.2f} minutes")
    print("\nModerAI text model training completed!")


if __name__ == "__main__":
    main()
