
from pathlib import Path
import pandas as pd

# Paths are relative to the project root.
DATA_PATH = Path("ml-service/data/raw/text/train.csv")
OUTPUT_PATH = Path("ml-service/data/processed/cleaned_train.csv")

LABELS = [
    "toxic",
    "severe_toxic",
    "obscene",
    "threat",
    "insult",
    "identity_hate",
]


def main():
    print("Loading ModerAI text dataset...")

    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATA_PATH.resolve()}"
        )

    df = pd.read_csv(DATA_PATH)

    print(f"\nOriginal dataset shape: {df.shape}")

    required = ["comment_text", *LABELS]
    missing = [col for col in required if col not in df.columns]

    if missing:
        raise ValueError(f"Required columns missing: {missing}")

    print("\nMissing values before cleaning:")
    print(df[required].isna().sum())

    # Remove rows without comment text.
    df = df.dropna(subset=["comment_text"]).copy()
    df["comment_text"] = df["comment_text"].astype(str).str.strip()
    df = df[df["comment_text"] != ""]

    # Remove exact duplicate comments.
    df = df.drop_duplicates(
        subset=["comment_text"]
    ).reset_index(drop=True)

    # Validate the six binary toxicity labels.
    for label in LABELS:
        df[label] = pd.to_numeric(df[label], errors="raise")

        if not df[label].isin([0, 1]).all():
            raise ValueError(f"Invalid values found in {label}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)

    print(f"\nCleaned dataset shape: {df.shape}")
    print("\nPositive examples per label:")
    print(df[LABELS].sum().sort_values(ascending=False))

    print(
        "\nComments with at least one positive label:",
        int(df[LABELS].any(axis=1).sum()),
    )

    print(f"\nSaved cleaned data to: {OUTPUT_PATH.resolve()}")
    print("\nDataset preparation completed successfully!")


if __name__ == "__main__":
    main()
