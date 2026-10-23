# ModerAI - Multimodal Content Moderation

ModerAI is a video moderation application with a React frontend, Node.js backend, and Python ML service. It combines four signals:

- Speech transcription with FFmpeg's Whisper filter, followed by text toxicity classification.
- Sampled video-frame image-safety classification.
- Independent non-speech audio-event classification with YAMNet.
- Human review for flagged events.

The application is an assistive triage tool. It does not prove intent or replace human moderation.

## Architecture

| Component | Stack | Responsibility |
| --- | --- | --- |
| Frontend | React, Vite, Tailwind | Upload, results, event review |
| Backend | Node.js, Express, MongoDB | Auth, storage, pipeline orchestration, fusion, review queue |
| ML service | FastAPI, scikit-learn, ONNX Runtime | Text, vision, transcription, and audio-event inference |
| Media tooling | FFmpeg and FFprobe | Frame extraction, WAV conversion, Whisper transcription |

### Analysis flow

1. The backend accepts an owned video upload and extracts sampled frames.
2. Text is analyzed from Whisper transcription.
3. Frames are analyzed by the image-safety ONNX model.
4. Up to `AUDIO_EVENT_MAX_SECONDS` of audio is converted to 16 kHz mono WAV and analyzed independently by YAMNet.
5. The backend records per-modality results and moderation events, then combines risk.
6. A failed text, vision, or audio analysis forces review. Only failure of all three marks analysis failed.
7. A video with no audio track records audio `no_audio`; visual analysis still runs. If transcription also fails, text is marked failed, analysis is partial, and review is required.

Audio-event categories are `explosion`, `distress`, `glass_break`, `fire`, and `alarm`. Event severity weights are `low` 0.35, `moderate` 0.60, `high` 0.80, and `critical` 0.95. Only moderate, high, and critical audio events create review events; low events are informational. YAMNet scores are not calibrated probabilities.

## Prerequisites

- Git
- Node.js 20 or newer
- Python 3.11
- MongoDB Community Server
- FFmpeg and FFprobe on `PATH`, with Whisper filter support for transcription

MongoDB is required for the backend. The ML service can be smoke-tested without MongoDB.

## Model artifacts

Weights and generated models are excluded from Git. Expected local paths:

| Model | Path | Labels / contract | Provenance |
| --- | --- | --- | --- |
| Text toxicity | `ml-service/models/text_toxicity_model.joblib` | Jigsaw labels, TF-IDF + logistic regression | Trained locally from the [Jigsaw Toxic Comment Classification Challenge](https://www.kaggle.com/c/jigsaw-toxic-comment-classification-challenge); dataset not included |
| Vision safety | `ml-service/models/vision/onnx/image-safety-classifier-xs.onnx` | `NSFL`, `NSFW`, `SFW`; RGB 0-255, 224x224 | [OwenElliott/image-safety-classifier-xs](https://huggingface.co/OwenElliott/image-safety-classifier-xs), MIT |
| Audio events | `ml-service/models/audio/yamnet.onnx` | 1-D float32 waveform at 16 kHz | [audiomagic/yamnet-onnx](https://huggingface.co/audiomagic/yamnet-onnx), Apache-2.0 |
| Audio class map | `ml-service/models/audio/yamnet_class_map.csv` | 521 YAMNet classes | [AudioSet](https://research.google.com/audioset/) YAMNet class map |
| Whisper | `ml-service/models/whisper/ggml-base.bin` | Whisper.cpp transcription | [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp); OpenAI Whisper and whisper.cpp are MIT |

Backend transcription uses FFmpeg's `whisper` filter with `ggml-base.bin`. The standalone `POST /predict/audio` endpoint uses Faster-Whisper `tiny` and is not used by the backend video pipeline.

Download the ignored Whisper artifact from the trusted Whisper.cpp model repository and place it at the exact path above:

```powershell
New-Item -ItemType Directory -Force -Path ml-service/models/whisper
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" -OutFile "ml-service/models/whisper/ggml-base.bin"
```

Do not commit model weights or downloaded datasets. `ml-service/models/model_manifest.json` records the verified SHA-256, size, labels, input contract, thresholds, and limitations. Validate the local artifacts before starting or promoting a model:

```powershell
cd ml-service
.\.venv\Scripts\python.exe scripts\validate_models.py
```

The vision model card reports 97.76% accuracy; this repository has not independently reproduced that result. Historical text metrics in `ml-service/reports/` have not been independently reproduced here. Audio event performance is unverified because no labeled evaluation set is included.

## Configuration

Copy the examples. Never commit real `.env` files.

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Set a unique `JWT_SECRET` of at least 32 characters in production. Set `ML_API_KEY` to the same random value for the backend and ML service to require an API key on ML endpoints. Health checks remain unauthenticated.

Useful backend settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAX_UPLOAD_MB` | 200 | Upload limit |
| `CHUNK_SECONDS` | 2 | Text chunk size |
| `AUDIO_EVENT_MIN_CONFIDENCE` | 0.3 | YAMNet event floor |
| `AUDIO_EVENT_MAX_SECONDS` | 600 | Maximum analyzed audio |
| `ALLOW_REGISTRATION` | true | Disable public registration in production if desired |
| `MODERATION_THRESHOLDS` | built-in | JSON overrides for text thresholds |

ML service environment:

| Variable | Purpose |
| --- | --- |
| `ML_API_KEY` | Optional shared API key; must match the backend |
| `PREDICTION_LOG_PATH` | Optional JSONL prediction log path |

The ML service writes privacy-preserving request and prediction records by default to `ml-service/logs/predictions.jsonl`. Raw transcripts, text, filenames, and uploads are not logged. The log directory is ignored by Git.

## Install dependencies

Backend:

```powershell
cd backend
npm ci
```

Frontend:

```powershell
cd frontend
npm ci
```

ML service:

```powershell
cd ml-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Install development-only Python tools separately:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

`scikit-learn` is pinned to 1.7.1 to match the committed model artifact contract. Retrain or revalidate if changing that version.

## Prepare the text model

Place a compatible Jigsaw-format training CSV at `ml-service/data/raw/text/train.csv`, then run:

```powershell
cd ml-service
.\.venv\Scripts\python.exe src/text/prepare_data.py
.\.venv\Scripts\python.exe src/text/train_model.py
```

This generates `ml-service/models/text_toxicity_model.joblib`. Update the manifest hash after retraining.

Re-run the offline evaluation against a labeled dataset with:

```powershell
.\.venv\Scripts\python.exe src\text\evaluate_toxicity_dataset.py --dataset data\evaluation\toxicity_eval_v1.csv --corpus data\processed\cleaned_train.csv
```

Treat the generated reports as release evidence only after checking the dataset split, label mapping, and thresholds.

## Run the application

Use three terminals from the project root. Start MongoDB first.

Terminal 1, ML service (set `ML_API_KEY` in the shell if you use one):

```powershell
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Terminal 2, backend:

```powershell
cd backend
npm run dev
```

Terminal 3, frontend:

```powershell
cd frontend
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

Verify service health and required FFmpeg support:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:5000/api/health
ffmpeg -hide_banner -filters | Select-String whisper
```

The ML health response must report the text, vision, Whisper, and audio-event models as loaded. The backend health response must report `"database":"up"`.

## API endpoints

ML service:

- `GET /health`
- `POST /predict/text` with JSON `{ "text": "..." }`
- `POST /predict/vision` with multipart `file`
- `POST /predict/audio/events?min_confidence=0.3` with multipart audio
- `POST /predict/audio` with multipart audio for transcription and text scoring

Backend:

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/videos`, `GET /api/videos`, `GET /api/videos/:videoId`
- `POST /api/videos/:videoId/analyze`, `GET /api/videos/:videoId/result`
- `GET /api/videos/:videoId/media-token`, `GET /api/videos/:videoId/media`
- Review and event routes under `/api/reviews` and `/api/events`

## Tests

Backend:

```powershell
cd backend
node --test "tests/*.test.js"
```

Frontend:

```powershell
cd frontend
npm test -- --run
npm run build
```

ML service:

```powershell
cd ml-service
.\.venv\Scripts\python.exe -m pytest tests -q
```

MongoDB integration tests use a dedicated `moderai_test_<uuid>` database and drop only that database. They skip automatically when no test connection string is provided:

```powershell
cd backend
$env:MODERAI_TEST_MONGODB_URI = "mongodb://127.0.0.1:27017"
node --test tests/mongoIntegration.test.js
Remove-Item Env:MODERAI_TEST_MONGODB_URI
```

For a manual upload-to-review smoke test, start MongoDB, the ML service, and the backend, then register a user, upload an MP4/WebM, call `POST /api/videos/:videoId/analyze`, poll `GET /api/videos/:videoId/result`, fetch a media token, and resolve at least one event through `POST /api/events/:eventId/decision`. Run this against a dedicated test database and temporary `STORAGE_DIR`, not production data.

No automated browser E2E suite is included. Frontend verification uses component tests plus a production build; backend API and persistence behavior are covered by Node tests, including the optional MongoDB integration test.

Model artifact validation and drift reporting:

```powershell
.\.venv\Scripts\python.exe scripts\validate_models.py
.\.venv\Scripts\python.exe scripts\drift_report.py --min-samples 20
```

## MLOps workflow

1. Train or obtain a candidate artifact outside the running service.
2. Record path, SHA-256, size, labels, input contract, source, license, and thresholds in `models/model_manifest.json`.
3. Run `scripts/validate_models.py`. A mismatch or contract failure must block promotion.
4. Run the test suites and an API smoke test against the candidate.
5. Compare evaluation metrics with the current baseline. Do not promote a model whose metrics or limitations are unknown without documenting that risk.
6. Deploy with the same pinned library version used for training, then watch request error rates and prediction-score drift.
7. Keep rollback artifacts and the previous manifest entry.

The drift report compares the first and second half of each endpoint/model/label series. It flags a mean shift of at least 0.10 or a shift in the rate of scores at least 0.50 of at least 0.10. It is a manual monitoring aid, not proof of model degradation. Investigate traffic-mix changes, thresholds, and upstream extraction before retraining.

## Security notes

- Uploads are size-limited, signature-checked, and stored outside source control.
- Media access uses short-lived scoped tokens; path traversal is rejected.
- Helmet security headers and per-IP rate limits are enabled for auth, upload, and analysis routes.
- CORS is restricted by `CORS_ORIGINS`.
- Production startup rejects the default JWT secret and requires at least 32 characters.
- Set `ML_API_KEY` when the ML service is reachable beyond a trusted local network.
- Bind the ML service to loopback unless a reverse proxy and network controls are in place.
- Prediction logs intentionally exclude raw content. Do not add transcripts, text, filenames, or media to logs.
- Review dataset and model licenses before redistribution.

## Limitations

- Audio-event thresholds and severity weights are heuristic; YAMNet scores are not calibrated.
- No labeled audio-event evaluation set is included, so precision and recall are unknown.
- Audio is analyzed for at most 600 seconds by default; longer media is truncated in the event analysis.
- Vision labels target sexual/suggestive content and graphic gore, not general violence.
- MongoDB is required for persistence and full upload-to-review end-to-end checks.
- No automated browser E2E suite is included; frontend coverage is component tests plus a production build.
- Model weights are intentionally absent from Git.
- Text historical metrics are not independently verified in this workspace.
