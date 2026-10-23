# ModeraAI Node.js backend

Express + MongoDB backend for the ModerAI content moderation workflow. The app keeps the React UI and `/api/...` routes compatible while connecting to a real text-toxicity model over the local ML service.

## Structure
- `server.js` starts the backend and manages shutdown.
- `app.js` configures Express and mounts the API routers.
- `routes/` maps endpoints to request middleware and controllers.
- `controllers/` handles HTTP input and response behavior.
- `services/` contains database-facing operations, moderation analysis, and transcription orchestration.
- `middleware/` contains authentication, upload handling, and error responses.
- `config.js` and `db.js` centralize application settings and MongoDB setup.

## Requirements
- Node.js 20+
- MongoDB running locally or a MongoDB Atlas connection string
- Python ML service on `http://127.0.0.1:8000` or a custom `ML_SERVICE_URL`

## Run
```bash
cd backend
npm install
# Set MONGODB_URI and replace JWT_SECRET in .env if needed
npm run dev
```

API health: http://localhost:5000/api/health

## Endpoints
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/videos` (multipart `file`, optional `duration`)
- `GET /api/videos?q=&risk=&status=&sort=newest|risk|name&limit=&skip=`
- `GET /api/videos/:videoId`, `DELETE /api/videos/:videoId`
- `GET /api/videos/:videoId/media-token` for a short-lived media URL token
- `GET /api/videos/:videoId/media?token=...` for authenticated playback with HTTP Range support
- `POST /api/videos/:videoId/analyze?force=true`
- `GET /api/videos/:videoId/result`
- `GET /api/reviews?status=pending|resolved|all`, `GET /api/reviews/summary`
- `POST /api/events/:eventId/decision` with `{ "action": "allow|flag|mute|blur|block", "reason": "optional" }`

## Current behavior
The backend uses Whisper for transcription, the trained text toxicity model for transcript scoring, and sampled-frame image-safety classification through the ML service. Text and visual findings are combined, and automated results that require review stay in the human review queue. Non-speech audio-event detection is not implemented. Stored media is served privately through short-lived, per-video tokens with byte-range support for browser playback.
