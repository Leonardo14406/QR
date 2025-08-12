import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../../config/db.js'; // Adjust the import path as necessary
import { signToken } from '../utils/jwt.js';
import nodemailer from 'nodemailer';

const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS);

const COOKIE_NAME = 'token';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 1000 * 60 * 60, // 1h
  path: '/'
};

export async function signup(req, res) {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ error: 'Email already in use' });

  const hashed = await bcrypt.hash(password, saltRounds);
  const user = await prisma.user.create({
    data: { email, password: hashed, name, role: 'USER' }
  });

  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, cookieOptions);
  res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name } });
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: 'Invalid credentials' });

  const accessToken = signToken(user);
  const refreshToken = signRefreshToken(user);

  // Store refresh token in DB
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiry
    },
  });

  res.cookie('token', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  });
}

export async function refreshTokenHandler(req, res) {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'Missing refresh token' });

  try {
    const payload = verifyRefreshToken(refreshToken);

    // Check DB for stored refresh token and validity
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (
      !storedToken ||
      storedToken.revoked ||
      storedToken.expiresAt < new Date()
    ) {
      return res.status(401).json({ error: 'Refresh token invalid or expired' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: 'User invalid or token revoked' });
    }

    // Issue new tokens
    const newAccessToken = signToken(user);
    const newRefreshToken = signRefreshToken(user);

    // Revoke old refresh token and store new one
    await prisma.refreshToken.update({
      where: { token: refreshToken },
      data: { revoked: true },
    });

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Set cookies with new tokens
    res.cookie('token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ message: 'Tokens refreshed' });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
}

export async function logout(req, res) {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  }

  res.clearCookie('token');
  res.clearCookie('refreshToken');

  res.json({ message: 'Logged out' });
}


export async function requestPasswordReset(req, res) {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.json({ message: 'If that email exists, a reset link has been sent' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h

  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt }
  });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Password Reset',
    text: `Click to reset password: ${resetUrl}`,
    html: `<a href="${resetUrl}">Reset your password</a>`
  });

  res.json({ message: 'If that email exists, a reset link has been sent' });
}

export async function resetPassword(req, res) {
  const { token, password } = req.body;
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.used || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const hashed = await bcrypt.hash(password, saltRounds);

  await prisma.user.update({
    where: { id: record.userId },
    data: { password: hashed, tokenVersion: { increment: 1 } }
  });

  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { used: true }
  });

  res.json({ message: 'Password reset successful, please log in again' });
}