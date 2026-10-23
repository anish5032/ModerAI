
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../',
);

const modelPath = path.join(
  projectDir,
  'ml-service',
  'models',
  'whisper',
  'ggml-base.bin',
);

function runFfmpeg(args, cwd = projectDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      cwd,
      windowsHide: true,
    });

    let stderr = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
      if (stderr.length > 12000) {
        stderr = stderr.slice(-12000);
      }
    });

    child.once('error', reject);

    child.once('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`FFmpeg exited with code ${code}: ${stderr}`),
        );
      }
    });
  });
}

function cleanSegments(segments) {
  const words = [];

  for (const segment of [...segments].sort(
    (a, b) => a.start - b.start,
  )) {
    const current = String(segment.text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    let overlap = 0;

    for (
      let count = 1;
      count <= Math.min(words.length, current.length);
      count += 1
    ) {
      const normalize = word =>
        word.toLowerCase().replace(/[.,!?;:]+$/g, '');

      const previous = words.slice(-count).map(normalize);
      const next = current.slice(0, count).map(normalize);

      if (previous.every((word, index) => word === next[index])) {
        overlap = count;
      }
    }

    words.push(...current.slice(overlap));
  }

  return words.join(' ');
}

export async function transcribeVideo(videoPath, language = 'en') {
  const absoluteVideoPath = path.resolve(videoPath);

  await fs.access(absoluteVideoPath);
  await fs.access(modelPath);

  const tempDir = await fs.mkdtemp(
    path.join(
      projectDir,
      'ml-service',
      'models',
      'whisper',
      'temp-',
    ),
  );

  const audioPath = path.join(tempDir, 'audio.wav');
  const transcriptPath = path.join(tempDir, 'transcript.jsonl');

  // Relative paths avoid Windows drive-letter colons in FFmpeg options.
  const relativeModel = path
    .relative(projectDir, modelPath)
    .replace(/\\/g, '/');

  const relativeTranscript = path
    .relative(projectDir, transcriptPath)
    .replace(/\\/g, '/');

  try {
    // Extract mono, 16 kHz audio.
    await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      absoluteVideoPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      audioPath,
    ]);

    const filter =
      `whisper=model=${relativeModel}:` +
      `language=${language}:use_gpu=false:format=json:` +
      `destination=${relativeTranscript}`;

    await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      audioPath,
      '-af',
      filter,
      '-f',
      'null',
      'NUL',
    ]);

    const raw = await fs.readFile(transcriptPath, 'utf8');

    const segments = raw
      .split(/\r?\n/)
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    return {
      text: cleanSegments(segments),
      segments,
      language,
    };
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}
