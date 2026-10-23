import { config } from '../config.js';

function serviceHeaders(extra = {}) {
  return config.mlApiKey
    ? { ...extra, 'X-API-Key': config.mlApiKey }
    : extra;
}

async function checkResponse(response) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');

    throw new Error(
      `ML service returned HTTP ${response.status}${body ? `: ${body}` : ''}`,
    );
  }

  return response.json();
}

export async function predictText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Text is required for toxicity prediction.');
  }

  const response = await fetch(
    `${config.mlServiceUrl}/predict/text`,
    {
      method: 'POST',
      headers: serviceHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        text: text.trim(),
      }),
      signal: AbortSignal.timeout(15000),
    },
  );

  return checkResponse(response);
}

export async function predictVision(imageBuffer, filename = 'frame.jpg') {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('A non-empty image buffer is required.');
  }

  const form = new FormData();

  const imageBlob = new Blob([imageBuffer], {
    type: 'image/jpeg',
  });

  form.append('file', imageBlob, filename);

  const response = await fetch(
    `${config.mlServiceUrl}/predict/vision`,
    {
      method: 'POST',
      headers: serviceHeaders(),
      body: form,
      signal: AbortSignal.timeout(30000),
    },
  );

  return checkResponse(response);
}

export async function predictAudioEvents(
  audioBuffer,
  filename = 'audio.wav',
  minConfidence = 0.3,
) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new Error('A non-empty audio buffer is required.');
  }

  const form = new FormData();
  const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
  form.append('file', audioBlob, filename);

  const confidence = Math.min(0.99, Math.max(0.05, Number(minConfidence)));
  const response = await fetch(
    `${config.mlServiceUrl}/predict/audio/events?min_confidence=${confidence}`,
    {
      method: 'POST',
      headers: serviceHeaders(),
      body: form,
      signal: AbortSignal.timeout(120000),
    },
  );

  return checkResponse(response);
}

export async function predictAudio(audioBuffer, filename = 'audio.wav') {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new Error('A non-empty audio buffer is required.');
  }

  const form = new FormData();

  const audioBlob = new Blob([audioBuffer], {
    type: filename.toLowerCase().endsWith('.mp3')
      ? 'audio/mpeg'
      : 'audio/wav',
  });

  form.append('file', audioBlob, filename);

  const response = await fetch(
    `${config.mlServiceUrl}/predict/audio`,
    {
      method: 'POST',
      headers: serviceHeaders(),
      body: form,
      signal: AbortSignal.timeout(120000),
    },
  );

  return checkResponse(response);
}
