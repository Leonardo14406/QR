import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

const REFRESH_SECRET = process.env.REFRESH_SECRET; // use env var!
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN;

// Signs access token (your existing function)
export function signToken(user) {
  return jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// New: sign refresh token (only userId + tokenVersion)
export function signRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}
