"""Predict posture from ax, ay, and az using posture_model.joblib."""

import argparse
from pathlib import Path
import math

import joblib
import pandas as pd


MODEL_PATH = Path(__file__).resolve().parent / "posture_model.joblib"


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict a posture from MPU6050 readings.")
    parser.add_argument("ax", nargs="?", type=float, default=1.016, help="Acceleration X")
    parser.add_argument("ay", nargs="?", type=float, default=0.050, help="Acceleration Y")
    parser.add_argument("az", nargs="?", type=float, default=0.070, help="Acceleration Z")
    args = parser.parse_args()

    values = [args.ax, args.ay, args.az]
    if not all(math.isfinite(value) for value in values):
        parser.error("ax, ay, and az must be finite numbers")
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found: {MODEL_PATH}\nRun python train_model.py first."
        )

    model = joblib.load(MODEL_PATH)
    features = pd.DataFrame([values], columns=["ax", "ay", "az"])
    predicted_posture = model.predict(features)[0]
    confidence = float(model.predict_proba(features).max()) * 100

    print(f"Predicted posture: {predicted_posture}")
    print(f"Confidence: {confidence:.2f}%")


if __name__ == "__main__":
    main()
