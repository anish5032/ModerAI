import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Writable } from 'node:stream';
import { mediaAuthRequired } from '../middleware/auth.js';
import {
  loadVideoMedia,
  parseByteRange,
  sendVideoMedia,
  signMediaToken,
  verifyMediaToken,
} from '../services/videoMediaService.js';
import { videoOut } from '../utils/common.js';
import { fail } from '../utils/errors.js';

class MockResponse extends Writable {
  constructor() {
    super();
    this.headers = {};
    this.statusCode = 200;
    this.body = Buffer.alloc(0);
  }

  _write(chunk, _encoding, callback) {
    this.body = Buffer.concat([this.body, Buffer.from(chunk)]);
    callback();
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
}

async function createMedia(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'moderaai-media-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'clip.mp4');
  await writeFile(filePath, Buffer.from('0123456789'));

  return {
    videoId: 'video-1',
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    filePath,
    size: 10,
  };
}

async function send(req, media) {
  const response = new MockResponse();
  await new Promise((resolve, reject) => {
    response.once('finish', resolve);
    response.once('error', reject);
    sendVideoMedia(req, response, media);
  });
  return response;
}

test('parseByteRange supports normal, open-ended, and suffix ranges', () => {
  assert.deepEqual(parseByteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(parseByteRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=8-99', 10), { start: 8, end: 9 });
  assert.equal(parseByteRange(undefined, 10), null);
});

test('parseByteRange rejects malformed and unsatisfiable ranges', () => {
  for (const header of [
    'bytes=',
    'bytes=-0',
    'bytes=10-',
    'bytes=5-2',
    'bytes=0-1,3-4',
    'items=0-1',
  ]) {
    assert.deepEqual(parseByteRange(header, 10), { invalid: true }, header);
  }
});

test('media tokens are scoped to one video and expire', () => {
  const token = signMediaToken('user-1', 'video-1');

  assert.equal(verifyMediaToken(token, 'video-1'), 'user-1');
  assert.throws(
    () => verifyMediaToken(token, 'video-2'),
    error => error.status === 401,
  );
  assert.throws(
    () => verifyMediaToken('not-a-token', 'video-1'),
    error => error.status === 401,
  );
  assert.equal(
    mediaAuthRequired(
      { query: { token }, params: { videoId: 'video-1' } },
      null,
      () => {},
    ),
    undefined,
  );
});

test('mediaAuthRequired sets the authenticated user or rejects the request', () => {
  const token = signMediaToken('user-1', 'video-1');
  const req = { query: { token }, params: { videoId: 'video-1' } };
  let error;

  mediaAuthRequired(req, null, nextError => {
    error = nextError;
  });

  assert.equal(req.userId, 'user-1');
  assert.equal(error, undefined);

  const rejected = { query: {}, params: { videoId: 'video-1' } };
  mediaAuthRequired(rejected, null, nextError => {
    error = nextError;
  });

  assert.equal(rejected.userId, undefined);
  assert.equal(error.status, 401);
  assert.equal(error.detail, 'Media link is invalid or expired.');
});

test('loadVideoMedia returns file metadata for an owned video', async t => {
  const expected = await createMedia(t);
  const media = await loadVideoMedia('video-1', 'user-1', {
    findOwnedVideo: async () => ({
      _id: 'video-1',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      storagePath: 'user-1/video-1.mp4',
    }),
    resolveVideoPath: () => expected.filePath,
    statFile: async filePath => {
      assert.equal(filePath, expected.filePath);
      return { isFile: () => true, size: 10 };
    },
  });

  assert.deepEqual(media, expected);
});

test('loadVideoMedia returns clear 404 errors for missing media', async () => {
  for (const options of [
    { findOwnedVideo: async () => ({ _id: 'video-1' }) },
    {
      findOwnedVideo: async () => ({
        _id: 'video-1',
        storagePath: '../outside.mp4',
      }),
      resolveVideoPath: () => {
        throw new Error('Invalid storage path');
      },
    },
    {
      findOwnedVideo: async () => ({
        _id: 'video-1',
        storagePath: 'user-1/video-1.mp4',
      }),
      resolveVideoPath: () => '/tmp/missing.mp4',
      statFile: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
    },
    {
      findOwnedVideo: async () => {
        throw fail(404, 'Video not found.');
      },
    },
  ]) {
    await assert.rejects(
      loadVideoMedia('video-1', 'user-1', options),
      error => error.status === 404,
    );
  }
});

test('sendVideoMedia streams the complete file with media headers', async t => {
  const media = await createMedia(t);
  const response = await send({ method: 'GET', headers: {} }, media);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.toString(), '0123456789');
  assert.equal(response.headers['content-type'], 'video/mp4');
  assert.equal(response.headers['content-length'], 10);
  assert.equal(response.headers['accept-ranges'], 'bytes');
  assert.equal(response.headers['cache-control'], 'private, max-age=3600');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.match(
    response.headers['content-disposition'],
    /^inline; filename\*=UTF-8''clip\.mp4$/,
  );
  assert.equal(response.headers['content-range'], undefined);
});

test('sendVideoMedia returns 206 responses for byte ranges', async t => {
  const media = await createMedia(t);
  const response = await send(
    { method: 'GET', headers: { range: 'bytes=2-5' } },
    media,
  );

  assert.equal(response.statusCode, 206);
  assert.equal(response.body.toString(), '2345');
  assert.equal(response.headers['content-length'], 4);
  assert.equal(response.headers['content-range'], 'bytes 2-5/10');

  const suffix = await send(
    { method: 'GET', headers: { range: 'bytes=-3' } },
    media,
  );

  assert.equal(suffix.statusCode, 206);
  assert.equal(suffix.body.toString(), '789');
  assert.equal(suffix.headers['content-range'], 'bytes 7-9/10');
});

test('sendVideoMedia supports HEAD and rejects bad ranges with 416', async t => {
  const media = await createMedia(t);
  const head = await send({ method: 'HEAD', headers: {} }, media);

  assert.equal(head.statusCode, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-length'], 10);

  const response = new MockResponse();

  assert.throws(
    () => sendVideoMedia(
      { method: 'GET', headers: { range: 'bytes=99-' } },
      response,
      media,
    ),
    error => error.status === 416,
  );
  assert.equal(response.headers['accept-ranges'], 'bytes');
  assert.equal(response.headers['content-range'], 'bytes */10');
});

test('videoOut does not expose the internal storage path', () => {
  const output = videoOut({
    _id: 'video-1',
    name: 'clip.mp4',
    storagePath: 'user-1/video-1.mp4',
  });

  assert.equal(output.id, 'video-1');
  assert.equal(output.name, 'clip.mp4');
  assert.equal(Object.hasOwn(output, 'storagePath'), false);
});
