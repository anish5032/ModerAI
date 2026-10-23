
from pathlib import Path
from io import BytesIO
import hmac
import os
import tempfile
import time
import uuid

import joblib
import onnxruntime as ort
from PIL import Image
from faster_whisper import WhisperModel
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src import observability
from src.audio import events as audio_events
from src.vision.preprocessing import preprocess_image


# --------------------------------------------------
# Paths and configuration
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

TEXT_MODEL_PATH = BASE_DIR / "models" / "text_toxicity_model.joblib"

VISION_MODEL_PATH = (
    BASE_DIR
    / "models"
    / "vision"
    / "onnx"
    / "image-safety-classifier-xs.onnx"
)

VISION_LABELS = ["NSFL", "NSFW", "SFW"]

ALLOWED_AUDIO_EXTENSIONS = {
    ".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm"
}

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_AUDIO_BYTES = 25 * 1024 * 1024
ML_API_KEY = os.environ.get("ML_API_KEY", "").strip()

app = FastAPI(
    title="ModerAI ML Service",
    version="1.3.0",
)


@app.middleware("http")
async def request_observability(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    path = request.url.path
    started = time.perf_counter()
    status = 500
    response = None

    try:
        if (
            ML_API_KEY
            and path != "/health"
            and not hmac.compare_digest(
                request.headers.get("x-api-key", "").encode("utf-8"),
                ML_API_KEY.encode("utf-8"),
            )
        ):
            status = 401
            response = JSONResponse(
                status_code=status,
                content={"detail": "Invalid or missing ML API key."},
            )
            observability.log_error(path, PermissionError("unauthorized"), status)
        else:
            response = await call_next(request)
            status = response.status_code
    except Exception as exc:
        observability.log_error(path, exc, 500)
        raise
    finally:
        if path != "/health":
            observability.log_request(
                request.method,
                path,
                status,
                (time.perf_counter() - started) * 1000,
                request_id,
            )

    response.headers["X-Request-ID"] = request_id
    return response


# --------------------------------------------------
# Load the text model
# --------------------------------------------------

if not TEXT_MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Trained text model not found: {TEXT_MODEL_PATH}"
    )

saved_model = joblib.load(TEXT_MODEL_PATH)

model = saved_model["model"]
labels = saved_model["labels"]


# --------------------------------------------------
# Load the vision model
# --------------------------------------------------

vision_session = None

if VISION_MODEL_PATH.is_file():
    vision_session = ort.InferenceSession(
        str(VISION_MODEL_PATH),
        providers=["CPUExecutionProvider"],
    )


# --------------------------------------------------
# Load the audio transcription model
# --------------------------------------------------

# The first startup may download the Whisper model.
whisper_model = WhisperModel(
    "tiny",
    device="cpu",
    compute_type="int8",
)


# --------------------------------------------------
# Request models
# --------------------------------------------------

class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


# --------------------------------------------------
# Health check
# --------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ModerAI ML Service",
        "text_model_loaded": True,
        "text_model_type": "TF-IDF + One-vs-Rest Logistic Regression",
        "text_labels": labels,
        "vision_model_loaded": vision_session is not None,
        "audio_transcription_loaded": whisper_model is not None,
        "audio_event_model_loaded": audio_events.MODEL_PATH.is_file(),
        "audio_event_model": audio_events.MODEL_ID,
    }


# --------------------------------------------------
# Text moderation
# --------------------------------------------------

@app.post("/predict/text")
def predict_text(request: TextRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Text must not be empty.",
        )

    probabilities = model.predict_proba([text])[0]

    scores = {
        label: round(float(score), 6)
        for label, score in zip(labels, probabilities)
    }
    top_category = max(scores, key=scores.get)

    observability.log_prediction(
        "/predict/text",
        "TF-IDF + One-vs-Rest Logistic Regression",
        scores=scores,
        details={
            "topCategory": top_category,
            "maxScore": scores[top_category],
            "characterCount": len(text),
        },
    )

    return {
        "text": text,
        "scores": scores,
        "model": "TF-IDF + One-vs-Rest Logistic Regression",
        "label_order": labels,
        "score_type": "raw model score",
    }


# --------------------------------------------------
# Image safety moderation
# --------------------------------------------------

@app.post("/predict/vision")
async def predict_vision(file: UploadFile = File(...)):
    if vision_session is None:
        raise HTTPException(
            status_code=503,
            detail="Vision model is not available.",
        )

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Upload an image file.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image must be 10 MB or smaller.",
        )

    try:
        with Image.open(BytesIO(content)) as image:
            pixels = preprocess_image(image)

        input_name = vision_session.get_inputs()[0].name

        output = vision_session.run(
            None,
            {input_name: pixels},
        )[0][0]

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not decode or process the uploaded image.",
        ) from exc

    if len(output) != len(VISION_LABELS):
        raise HTTPException(
            status_code=500,
            detail="Unexpected vision model output shape.",
        )

    scores = {
        label: round(float(score), 6)
        for label, score in zip(VISION_LABELS, output)
    }
    predicted_class = max(scores, key=scores.get)

    observability.log_prediction(
        "/predict/vision",
        "OwenElliott/image-safety-classifier-xs",
        scores=scores,
        flags=[predicted_class] if predicted_class != "SFW" else [],
        details={"predictedClass": predicted_class},
    )

    return {
        "filename": file.filename,
        "predicted_class": predicted_class,
        "scores": scores,
        "model": "OwenElliott/image-safety-classifier-xs",
        "label_order": VISION_LABELS,
        "score_type": "class probability (softmax included in exported model)",
        "preprocessing": "RGB, bilinear resize to 224x224, pixel range 0-255",
        "note": (
            "NSFW targets sexual/suggestive content and NSFL targets "
            "graphic gore; this is not a general violence classifier."
        ),
    }


# --------------------------------------------------
# Non-speech audio event analysis
# --------------------------------------------------

@app.post("/predict/audio/events")
async def predict_audio_events(
    file: UploadFile = File(...),
    min_confidence: float = Query(
        default=audio_events.DEFAULT_MIN_CONFIDENCE,
        ge=0.05,
        le=0.99,
    ),
):
    filename = file.filename or "audio.wav"
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Supported formats: WAV, MP3, M4A, "
                "OGG, FLAC, WEBM."
            ),
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded audio is empty.",
        )

    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Audio must be 25 MB or smaller.",
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=extension,
            delete=False,
        ) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        result = await run_in_threadpool(
            audio_events.analyze_audio_file,
            temp_path,
            min_confidence,
        )
        result["filename"] = filename

        observability.log_prediction(
            "/predict/audio/events",
            audio_events.MODEL_ID,
            scores={
                item["class"]: item["score"]
                for item in result.get("topClasses", [])
            },
            flags=sorted(
                {event["category"] for event in result.get("events", [])}
            ),
            details={
                "riskLevel": result.get("riskLevel"),
                "eventCount": len(result.get("events", [])),
                "analyzedSeconds": result.get("analyzedSeconds"),
                "truncated": result.get("truncated"),
                "minConfidence": min_confidence,
            },
        )

        return result

    except audio_events.AudioEventError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Audio event analysis failed: {type(exc).__name__}",
        ) from exc

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


# --------------------------------------------------
# Audio transcription and toxicity analysis
# --------------------------------------------------

@app.post("/predict/audio")
async def predict_audio(file: UploadFile = File(...)):
    filename = file.filename or "audio.wav"
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Supported formats: WAV, MP3, M4A, "
                "OGG, FLAC, WEBM."
            ),
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded audio is empty.",
        )

    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Audio must be 25 MB or smaller.",
        )

    temp_path = None

    try:
        # Save the upload temporarily for Whisper.
        with tempfile.NamedTemporaryFile(
            suffix=extension,
            delete=False,
        ) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        # Transcribe speech.
        segments, info = whisper_model.transcribe(
            temp_path,
            beam_size=1,
        )

        # Whisper segments are generated lazily.
        transcript = " ".join(
            segment.text.strip()
            for segment in segments
        ).strip()

        if not transcript:
            raise HTTPException(
                status_code=422,
                detail="No speech could be transcribed from this audio.",
            )

        # Reuse the existing text toxicity model.
        probabilities = model.predict_proba([transcript])[0]

        scores = {
            label: round(float(score), 6)
            for label, score in zip(labels, probabilities)
        }
        top_category = max(scores, key=scores.get)

        observability.log_prediction(
            "/predict/audio",
            "Faster-Whisper tiny + text toxicity model",
            scores=scores,
            details={
                "language": info.language,
                "languageProbability": round(
                    float(info.language_probability),
                    4,
                ),
                "topCategory": top_category,
                "maxScore": scores[top_category],
            },
        )

        return {
            "filename": filename,
            "transcript": transcript,
            "language": info.language,
            "language_probability": round(
                float(info.language_probability),
                4,
            ),
            "scores": scores,
            "transcription_model": "Faster-Whisper tiny",
            "text_model": "TF-IDF + One-vs-Rest Logistic Regression",
            "score_type": "raw model scores",
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Audio processing failed: {type(exc).__name__}",
        ) from exc

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
