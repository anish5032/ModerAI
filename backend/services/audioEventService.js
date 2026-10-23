import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { predictAudioEvents } from './mlService.js';

const MAX_WAV_BYTES = 26 * 1024 * 1024;
const SEVERITY_LEVELS = new Set(['safe', 'low', 'moderate', 'high', 'critical']);

function runProcess(command, args, { maxBytes = 0, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks = [];
    let totalBytes = 0;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let exceededLimit = false;

    const timer = setTimeout(() => {
      finish(new Error(`${command} timed out after ${timeoutMs} ms.`), true);
    }, timeoutMs);

    function finish(error, kill = false) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (kill && child.exitCode === null && !child.killed) {
        child.kill();
      }

      if (error) {
        reject(error);
        return;
      }

      resolve({
        buffer: Buffer.concat(chunks),
        stdout,
        stderr,
      });
    }

    child.stdout.on('data', (chunk) => {
      if (maxBytes > 0) {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          exceededLimit = true;
          finish(
            new Error(
              `Extracted audio exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
            ),
            true,
          );
          return;
        }
        chunks.push(chunk);
      } else {
        stdout += chunk.toString('utf8');
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    child.once('error', (error) => {
      finish(
        new Error(
          `Could not start ${command}: ${error.message}. Install FFmpeg and ensure it is on PATH.`,
        ),
      );
    });

    child.once('close', (code) => {
      if (settled) return;

      if (exceededLimit) {
        finish(new Error('Extracted audio exceeds the size limit.'));
        return;
      }

      if (code !== 0) {
        finish(
          new Error(
            `${command} exited with code ${code}: ${stderr || 'unknown error'}`,
          ),
        );
        return;
      }

      finish(null);
    });
  });
}

export async function hasAudioStream(videoPath) {
  const { stdout } = await runProcess(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ],
    { timeoutMs: 20000 },
  );

  return stdout.trim() === 'audio';
}

export async function extractAudioBuffer(videoPath) {
  const { buffer } = await runProcess(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      videoPath,
      '-vn',
      '-t',
      String(config.audioEventMaxSeconds),
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      '-f',
      'wav',
      'pipe:1',
    ],
    { maxBytes: MAX_WAV_BYTES, timeoutMs: 120000 },
  );

  if (
    buffer.length < 12 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('FFmpeg did not return a valid WAV audio stream.');
  }

  return buffer;
}

function validatePrediction(prediction) {
  if (!prediction || typeof prediction !== 'object') {
    throw new Error('Audio event model returned no result.');
  }

  if (!SEVERITY_LEVELS.has(prediction.riskLevel)) {
    throw new Error('Audio event model returned an invalid risk level.');
  }

  const riskScore = Number(prediction.riskScore);
  if (!Number.isFinite(riskScore) || riskScore < 0 || riskScore > 1) {
    throw new Error('Audio event model returned an invalid risk score.');
  }

  if (!Array.isArray(prediction.events)) {
    throw new Error('Audio event model returned no event list.');
  }

  for (const event of prediction.events) {
    if (
      !event ||
      typeof event.category !== 'string' ||
      typeof event.label !== 'string' ||
      !SEVERITY_LEVELS.has(event.severity) ||
      !Number.isFinite(Number(event.startSeconds)) ||
      !Number.isFinite(Number(event.endSeconds)) ||
      !Number.isFinite(Number(event.score))
    ) {
      throw new Error('Audio event model returned an invalid event.');
    }
  }

  return prediction;
}

export async function analyzeVideoAudio(
  videoPath,
  {
    hasAudio = hasAudioStream,
    extractAudio = extractAudioBuffer,
    predictEvents = predictAudioEvents,
    minConfidence = config.audioEventMinConfidence,
  } = {},
) {
  const audioPresent = await hasAudio(videoPath);

  if (!audioPresent) {
    return {
      status: 'no_audio',
      events: [],
      riskLevel: 'safe',
      riskScore: 0,
      flaggedEventCount: 0,
      model: null,
      error: null,
    };
  }

  const audioBuffer = await extractAudio(videoPath);
  const prediction = validatePrediction(
    await predictEvents(audioBuffer, 'audio.wav', minConfidence),
  );

  return {
    ...prediction,
    status: 'completed',
    flaggedEventCount: prediction.events.length,
    error: null,
  };
}
