# ModerAI - Multimodal Content Moderation



ModerAI is a content moderation application with a React frontend, Node.js backend, and Python ML service.



\## Architecture



\- \*\*Frontend:\*\* React, Vite, Tailwind CSS

\- \*\*Backend:\*\* Node.js, Express, MongoDB

\- \*\*ML service:\*\* Python, FastAPI, scikit-learn, ONNX Runtime

\- \*\*Video processing:\*\* FFmpeg

\- \*\*Speech transcription:\*\* Whisper through FFmpeg

\- \*\*Text moderation:\*\* TF-IDF and Logistic Regression

\- \*\*Vision moderation:\*\* ONNX image-safety classifier



The application analyzes video transcripts and sampled video frames. Independent non-speech audio-event classification is not yet integrated.



\## Prerequisites



Install Git, Node.js 20 or newer, Python 3.11, MongoDB Community Server, and an FFmpeg build with the Whisper filter enabled.



\## Configuration



Copy the example environment files:



```powershell

Copy-Item backend/.env.example backend/.env

Copy-Item frontend/.env.example frontend/.env

```



Set a strong, private `JWT\_SECRET` in `backend/.env`. Never commit real environment files.



\## Install dependencies



Install backend dependencies:



```powershell

cd backend

npm ci

cd ..

```



Install frontend dependencies:



```powershell

cd frontend

npm ci

cd ..

```



Set up the Python environment:



```powershell

cd ml-service

python -m venv .venv

.\\.venv\\Scripts\\python.exe -m pip install --upgrade pip

.\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt

cd ..

```



\## Prepare the text model



The trained model and datasets are excluded from Git.



Obtain a compatible Jigsaw toxicity dataset and place its training CSV at `ml-service/data/raw/text/train.csv`.



Then run:



```powershell

cd ml-service

.\\.venv\\Scripts\\python.exe src/text/prepare\_data.py

.\\.venv\\Scripts\\python.exe src/text/train\_model.py

cd ..

```



This generates `ml-service/models/text\_toxicity\_model.joblib`, which the ML API requires.



\## Vision and transcription models



The vision prediction script can download its ONNX model from Hugging Face. The expected API model path is `ml-service/models/vision/onnx/image-safety-classifier-xs.onnx`.



Backend video transcription requires Whisper.cpp's `ggml-base.bin` at `ml-service/models/whisper/ggml-base.bin`. Obtain the model from a trusted Whisper.cpp model source. FFmpeg must support the Whisper filter.



Model weights are not stored in this repository.



\## Run the application



Open three separate PowerShell terminals from the project root.



\*\*Terminal 1 — ML service\*\*



```powershell

cd ml-service

.\\.venv\\Scripts\\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000

```



\*\*Terminal 2 — Backend\*\*



```powershell

cd backend

npm run dev

```



\*\*Terminal 3 — Frontend\*\*



```powershell

cd frontend

npm run dev

```



Open the URL printed by Vite, usually `http://localhost:5173`.



Ensure MongoDB is running locally before starting the backend.



\## Tests



Backend:



```powershell

cd backend

node --test "tests/\*.test.js"

```



Frontend:



```powershell

cd frontend

npm test

npm run build

```



ML service:



```powershell

cd ml-service

.\\.venv\\Scripts\\python.exe -m pytest

```



\## Current limitations



\- Audio is transcribed to text; independent non-speech audio-event classification is not yet integrated.

\- Vision predictions depend on the downloaded model and its supported labels.

\- Full inference requires model weights that are intentionally excluded from Git.



\## Repository hygiene



Environment secrets, uploaded videos, generated datasets, model weights, caches, virtual environments, and build output should remain out of Git. Follow the relevant dataset and model licenses.
