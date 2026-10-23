export function fail(status, detail) {
  return Object.assign(new Error(detail), { status, detail });
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
