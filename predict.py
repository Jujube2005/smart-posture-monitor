"""Predict posture from ax, ay, and az using posture_model.joblib."""

import argparse
import json
from pathlib import Path
import math
import sys

import joblib
import pandas as pd


MODEL_PATH = Path(__file__).resolve().parent / "posture_model.joblib"


def load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    return joblib.load(MODEL_PATH)


def predict(model, values: list[float]) -> tuple[str, float]:
    features = pd.DataFrame([values], columns=["ax", "ay", "az"])
    predicted_posture = str(model.predict(features)[0])
    probabilities = model.predict_proba(features)[0]
    class_index = list(model.classes_).index(predicted_posture)
    confidence = float(probabilities[class_index])
    return predicted_posture, confidence


def run_jsonl_worker() -> None:
    """Serve newline-delimited JSON requests, keeping the model in memory."""
    model = load_model()
    supported_classes = set(map(str, model.classes_))
    expected_classes = {"STRAIGHT", "HUNCHED", "LEAN LEFT", "LEAN RIGHT"}
    if supported_classes != expected_classes:
        raise ValueError(
            "Model must support all four posture classes; found: "
            + ", ".join(sorted(supported_classes))
        )

    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            values = [request.get("ax"), request.get("ay"), request.get("az")]
            if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in values):
                raise ValueError("ax, ay, and az must be numbers")
            values = [float(value) for value in values]
            if not all(math.isfinite(value) for value in values):
                raise ValueError("ax, ay, and az must be finite numbers")

            posture, confidence = predict(model, values)
            response = {"id": request_id, "posture": posture, "confidence": confidence}
        except Exception as error:
            response = {"id": request_id, "error": str(error)}
        print(json.dumps(response), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict a posture from MPU6050 readings.")
    parser.add_argument(
        "--server",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    parser.add_argument("ax", nargs="?", type=float, default=1.016, help="Acceleration X")
    parser.add_argument("ay", nargs="?", type=float, default=0.050, help="Acceleration Y")
    parser.add_argument("az", nargs="?", type=float, default=0.070, help="Acceleration Z")
    args = parser.parse_args()

    if args.server:
        run_jsonl_worker()
        return

    values = [args.ax, args.ay, args.az]
    if not all(math.isfinite(value) for value in values):
        parser.error("ax, ay, and az must be finite numbers")
    model = load_model()
    predicted_posture, confidence = predict(model, values)

    print(f"Predicted posture: {predicted_posture}")
    print(f"Confidence: {confidence * 100:.2f}%")


if __name__ == "__main__":
    main()
