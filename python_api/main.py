"""FastAPI inference service for the Smart Posture Monitor."""

import logging
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from supabase import Client, create_client

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("posture-api")

Posture = Literal["STRAIGHT", "HUNCHED", "LEAN LEFT", "LEAN RIGHT"]
FEATURES = ["ax", "ay", "az"]
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "posture_model.joblib"

app = FastAPI(title="Smart Posture Prediction API", version="1.0.0")


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sensor_posture: Posture | None = None
    # Older clients may call this sensor_posture field simply `posture`.
    posture: Posture | None = None
    ax: float
    ay: float
    az: float
    bad_duration_ms: float = Field(default=0, ge=0)


def _configured_model_path() -> Path:
    return Path(os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH))).expanduser()


@lru_cache(maxsize=1)
def load_model():
    path = _configured_model_path()
    if not path.is_file():
        raise FileNotFoundError(f"Model file is missing at configured path: {path}")
    model = joblib.load(path)
    if not hasattr(model, "predict_proba") or not hasattr(model, "classes_"):
        raise ValueError("Configured model must support predict_proba and classes_")
    classes = set(map(str, model.classes_))
    expected = set(Posture.__args__)
    if classes != expected:
        raise ValueError("Configured model does not contain all supported posture classes")
    return model


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured")
    return create_client(url, key)


@app.get("/health")
def health():
    # Liveness only: infrastructure can check the process before model/secrets are
    # configured. Prediction reports those configuration problems as HTTP 503.
    return {"status": "ok"}


@app.post("/api/predict")
def predict(request: PredictionRequest):
    values = [request.ax, request.ay, request.az]
    if not all(math.isfinite(value) for value in values):
        raise HTTPException(status_code=422, detail="ax, ay, and az must be finite numbers")

    try:
        model = load_model()
    except FileNotFoundError as error:
        logger.error("Posture model unavailable: %s", error)
        raise HTTPException(status_code=503, detail="Prediction model is not configured") from error
    except Exception as error:
        logger.exception("Could not load posture model")
        raise HTTPException(status_code=503, detail="Prediction model could not be loaded") from error

    try:
        features = pd.DataFrame([values], columns=FEATURES)
        probabilities = model.predict_proba(features)[0]
        index = int(probabilities.argmax())
        posture = str(model.classes_[index])
        confidence = float(probabilities[index])
    except Exception as error:
        logger.exception("Posture inference failed")
        raise HTTPException(status_code=500, detail="Posture inference failed") from error

    bad_duration = 0 if posture == "STRAIGHT" else request.bad_duration_ms
    try:
        client = get_supabase()
        result = client.table("posture_data").insert({
            "posture": posture,
            "confidence": confidence,
            "ax": request.ax,
            "ay": request.ay,
            "az": request.az,
            "bad_duration_ms": bad_duration,
        }).execute()
        if not result.data:
            raise RuntimeError("Supabase insert returned no row")
    except Exception as error:
        logger.exception("Could not save posture prediction to Supabase")
        raise HTTPException(status_code=502, detail="Prediction was made but could not be saved") from error

    return {"posture": posture, "confidence": confidence}
