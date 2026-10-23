import rateLimit from 'express-rate-limit';

function limiter(windowMs, limit, detail) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { detail },
  });
}

export const authLimiter = limiter(
  15 * 60 * 1000,
  30,
  'Too many authentication attempts. Try again later.',
);

export const uploadLimiter = limiter(
  60 * 60 * 1000,
  30,
  'Too many uploads from this address. Try again later.',
);

export const analysisLimiter = limiter(
  60 * 60 * 1000,
  120,
  'Too many analysis requests from this address. Try again later.',
);
