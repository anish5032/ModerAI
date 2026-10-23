export function errorHandler(error, _req, res, _next) {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    detail: error.detail || (status === 500 ? 'Internal server error.' : error.message || 'Request failed.'),
  });
}

export function notFoundHandler(_req, res) {
  return res.status(404).json({ detail: 'Not found.' });
}
