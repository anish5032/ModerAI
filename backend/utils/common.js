import crypto from 'node:crypto';

export const now = () => new Date();
export const createId = () => crypto.randomUUID();

export function publicDoc(document) {
  if (!document) return document;
  const { _id, ...rest } = document;
  return { ...rest, id: _id };
}

export const userOut = user => ({
  id: user._id,
  email: user.email,
  name: user.name,
  role: user.role,
});

export function videoOut(document) {
  if (!document) return document;
  const { storagePath, ...rest } = publicDoc(document);
  return rest;
}

export function eventOut(document, videoName = null) {
  return { ...publicDoc(document), videoName: videoName ?? document.videoName ?? null };
}
