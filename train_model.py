"""Train and evaluate the Smart Posture Monitor Random Forest model."""

import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split


BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "posture_data_rows.csv"
MODEL_PATH = BASE_DIR / "posture_model.joblib"
DEPLOYMENT_MODEL_PATH = BASE_DIR / "lib" / "posture-model.json"
FEATURES = ["ax", "ay", "az"]
CLASSES = ["STRAIGHT", "HUNCHED", "LEAN LEFT", "LEAN RIGHT"]
RANDOM_STATE = 42


def main() -> None:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATASET_PATH}\n"
            "Put posture_data_rows.csv in the same folder as train_model.py."
        )

    dataset = pd.read_csv(DATASET_PATH)
    required_columns = FEATURES + ["posture"]
    missing_columns = [column for column in required_columns if column not in dataset.columns]
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing_columns)}")

    data = dataset[required_columns].copy()
    data["posture"] = data["posture"].astype("string").str.strip().str.upper()
    data["posture"] = data["posture"].str.split().str.join(" ")
    for feature in FEATURES:
        data[feature] = pd.to_numeric(data[feature], errors="coerce")

    invalid_rows = data[required_columns].isna().any(axis=1)
    if invalid_rows.any():
        raise ValueError(
            f"Dataset contains {int(invalid_rows.sum())} rows with missing or invalid values. "
            "Clean those rows before training."
        )

    unexpected = sorted(set(data["posture"]) - set(CLASSES))
    if unexpected:
        raise ValueError(f"Unexpected posture labels: {', '.join(unexpected)}")

    class_counts = data["posture"].value_counts().reindex(CLASSES, fill_value=0)
    absent_classes = class_counts[class_counts == 0].index.tolist()
    if absent_classes:
        raise ValueError(f"Dataset is missing classes: {', '.join(absent_classes)}")

    X = data[FEATURES]
    y = data["posture"]
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    model = RandomForestClassifier(
        n_estimators=300,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    # Fit only on the training split. The test split is used only for evaluation.
    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test,
        predictions,
        labels=CLASSES,
        average="weighted",
        zero_division=0,
    )

    print(f"Dataset shape: {dataset.shape[0]} rows x {dataset.shape[1]} columns")
    print("Posture counts:")
    for label in CLASSES:
        print(f"  {label}: {class_counts[label]}")
    print(f"Train rows: {len(X_train)}")
    print(f"Test rows: {len(X_test)}")
    print(f"Accuracy:  {accuracy_score(y_test, predictions):.4f}")
    print(f"Precision (weighted): {precision:.4f}")
    print(f"Recall (weighted):    {recall:.4f}")
    print(f"F1-score (weighted):  {f1:.4f}")

    print("\nClassification report:")
    print(
        classification_report(
            y_test,
            predictions,
            labels=CLASSES,
            zero_division=0,
        )
    )
    print("Confusion matrix (rows=actual, columns=predicted):")
    print(f"Label order: {CLASSES}")
    print(confusion_matrix(y_test, predictions, labels=CLASSES))

    supported_classes = set(model.classes_)
    if supported_classes != set(CLASSES):
        raise RuntimeError(
            "Trained model does not support all four classes: "
            f"{sorted(supported_classes)}"
        )
    print(f"Model supports all 4 classes: {', '.join(model.classes_)}")

    joblib.dump(model, MODEL_PATH)
    print(f"Saved model: {MODEL_PATH}")

    # Vercel serverless functions cannot depend on a persistent local Python
    # worker. Export the trained forest's tree arrays for native TypeScript
    # inference while retaining the joblib artifact for local Python use.
    DEPLOYMENT_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    deployment_model = {
        "classes": [str(label) for label in model.classes_],
        "trees": [
            {
                "left": tree.tree_.children_left.tolist(),
                "right": tree.tree_.children_right.tolist(),
                "feature": tree.tree_.feature.tolist(),
                "threshold": tree.tree_.threshold.tolist(),
                "value": tree.tree_.value[:, 0, :].tolist(),
            }
            for tree in model.estimators_
        ],
    }
    with DEPLOYMENT_MODEL_PATH.open("w", encoding="utf-8") as output:
        json.dump(deployment_model, output, separators=(",", ":"))
    print(f"Saved deployment model: {DEPLOYMENT_MODEL_PATH}")


if __name__ == "__main__":
    main()
