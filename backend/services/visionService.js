
import { spawn } from 'node:child_process';
import { predictVision } from './mlService.js';

const MAX_SAMPLED_FRAMES = 12;
const MAX_FRAME_BYTES = 10 * 1024 * 1024;

function extractFrame(videoPath, seconds) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', String(seconds),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=224:224',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ];

    const child = spawn('ffmpeg', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks = [];
    let totalBytes = 0;
    let stderr = '';
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;

      if (child.exitCode === null && !child.killed) {
        child.kill();
      }

      reject(error);
    };

    child.stdout.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_FRAME_BYTES) {
        fail(new Error('Extracted frame exceeds the 10 MB size limit.'));
        return;
      }

      chunks.push(chunk);
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;

      if (stderr.length > 4000) {
        stderr = stderr.slice(-4000);
      }
    });

    child.once('error', (error) => {
      fail(new Error(`Could not start FFmpeg: ${error.message}`));
    });

    child.once('close', (code) => {
      if (settled) return;

      if (code !== 0) {
        fail(new Error(`Frame extraction failed: ${stderr || `FFmpeg exited with code ${code}`}`));
        return;
      }

      const imageBuffer = Buffer.concat(chunks);

      if (imageBuffer.length === 0) {
        fail(new Error(`No frame extracted at ${seconds}s.`));
        return;
      }

      // JPEG files begin with the SOI marker FF D8.
      if (
        imageBuffer.length < 4 ||
        imageBuffer[0] !== 0xff ||
        imageBuffer[1] !== 0xd8
      ) {
        fail(new Error(`FFmpeg output at ${seconds}s is not a valid JPEG frame.`));
        return;
      }

      settled = true;
      resolve(imageBuffer);
    });
  });
}

export async function analyzeVideoFrames(videoPath, durationSeconds) {
  const duration = Number(durationSeconds);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('A valid video duration is required for vision analysis.');
  }

  const sampleCount = Math.min(
    MAX_SAMPLED_FRAMES,
    Math.max(1, Math.ceil(duration / 5)),
  );

  const results = [];
  const interval = duration / sampleCount;

  for (let index = 0; index < sampleCount; index += 1) {
    const timestamp = Math.min(
      duration - 0.05,
      (index + 0.5) * interval,
    );

    if (timestamp < 0) continue;

    const imageBuffer = await extractFrame(videoPath, timestamp);

    // predictVision must send this Buffer as an image file in multipart form data.
    const prediction = await predictVision(imageBuffer, 'frame.jpg');

    results.push({
      timestampSeconds: Math.round(timestamp * 100) / 100,
      predictedClass: prediction.predicted_class,
      scores: prediction.scores,
      model: prediction.model,
      scoreType: prediction.score_type,
      note: prediction.note,
    });
  }

  return results;
}
