// src/controllers/authController.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../config/db.js";
import nodemailer from "nodemailer";
import crypto from "crypto";

const { JWT_SECRET, NODE_ENV } = process.env;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required but not set");
}

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const REFRESH_COOKIE_NAME = 'refreshToken';
const ALLOWED_SIGNUP_ROLES = ["GENERATOR", "RECEIVER"]; // No ADMIN

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
// Helper: JWT
function generateAccessToken({ userId, email, roles }) {
  return jwt.sign(
    { sub: userId, email, roles: roles || [] },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

// Simple mailer (configure SMTP in env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

function setRefreshCookie(res, value) {
  const isProduction = NODE_ENV === "production";
  
  res.cookie(REFRESH_COOKIE_NAME, value, {
    httpOnly: true,
    secure: isProduction,  // true in production, false in development
    sameSite: isProduction ? 'none' : 'lax',  // 'none' in production, 'lax' in development
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_SEC * 1000,
    domain: isProduction ? 'qr-ui-kappa.vercel.app' : 'localhost'  // Set your production domain
  });
}
// access token is returned in JSON; frontend stores in memory

function clearAuthCookies(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
}

async function issueRefreshToken({ userId, ip, userAgent }) {
  const raw = crypto.randomBytes(40).toString("hex");
  const hash = sha256Hex(raw);
  const expires = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);

  const record = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: expires,
      ip: ip || null,
      userAgent: userAgent || ""
    }
  });

  return { raw, record };
}

const AuthController = {
  // ---------------- AUTH ----------------
  signup: async (req, res) => {
    const { email, password, firstName, lastName, intendedUse = [] } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);

    // Filter user-provided roles to allowed ones only (no ADMIN)
    const requested = Array.isArray(intendedUse) ? intendedUse : [];
    const safeRoles = requested.filter((r) => ALLOWED_SIGNUP_ROLES.includes(r));

    const rolesData = safeRoles.map((roleName) => ({
      role: { connect: { name: roleName } }
    }));

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        roles: { create: rolesData }
      },
      include: { roles: { include: { role: true } } }
    });

    const roleNames = user.roles.map((r) => r.role.name);
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      roles: roleNames
    });

    // Set refresh token as cookie; return access token in response body
    const { raw: refreshValue } = await issueRefreshToken({
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || ""
    });
    setRefreshCookie(res, refreshValue);

    return res.status(201).json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: roleNames,
        intendedUse: roleNames
      }
    });
  },

  login: async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } }
    });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ message: "Invalid credentials" });

    const roleNames = user.roles.map((r) => r.role.name);
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      roles: roleNames
    });

    const { raw: refreshValue } = await issueRefreshToken({
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || ""
    });
    setRefreshCookie(res, refreshValue);

    return res.json({ accessToken, user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, intendedUse: roleNames } });
  },

  refresh: async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) return res.status(401).json({ message: "Missing refresh token" });

    const hash = sha256Hex(token);
    const existing = await prisma.refreshToken.findFirst({
      where: {
        tokenHash: hash,
        revoked: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!existing) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: existing.userId },
      include: { roles: { include: { role: true } } }
    });
    if (!user) return res.status(401).json({ message: "User not found" });

    // Rotate: create a new refresh token and revoke the old one
    const { raw: newRefreshValue, record: newRt } = await issueRefreshToken({
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || ""
    });

    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revoked: true, replacedBy: newRt.id }
    });

    setRefreshCookie(res, newRefreshValue);

    const roleNames = user.roles.map((r) => r.role.name);
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      roles: roleNames
    });
    
    return res.json({ accessToken, user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, intendedUse: roleNames } });
  },

  logout: async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (token) {
      const hash = sha256Hex(token);
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hash },
        data: { revoked: true }
      });
    }
    
    clearAuthCookies(res);
    return res.sendStatus(204);
  },

  me: async (req, res) => {
    const userId = req.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } }
    });
    if (!user) return res.status(404).json({ message: "Not found" });

    return res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles.map((r) => r.role.name)
    });
  },

  // ---------------- PASSWORD RESET ----------------
  forgotPassword: async (req, res) => {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    // Do not reveal if the user exists
    if (!user) return res.status(200).json({ message: "If account exists, email sent" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: resetTokenHash, resetTokenExp: new Date(Date.now() + 1000 * 60 * 15) } // 15 mins
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&id=${user.id}`;

    await transporter.sendMail({
      to: user.email,
      subject: "Password Reset",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`
    });

    return res.json({ message: "If account exists, email sent" });
  },

  resetPassword: async (req, res) => {
    const { id, token, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.resetToken || !user.resetTokenExp) {
      return res.status(400).json({ message: "Invalid or expired reset request" });
    }
    if (user.resetTokenExp < new Date()) {
      return res.status(400).json({ message: "Token expired" });
    }

    const valid = await bcrypt.compare(token, user.resetToken);
    if (!valid) return res.status(400).json({ message: "Invalid token" });

    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { passwordHash: newHash, resetToken: null, resetTokenExp: null }
    });

    await transporter.sendMail({
      to: user.email,
      subject: "Password Reset Successful",
      html: `<p>Your password has been reset successfully. If you did not perform this action, please contact support immediately.</p>`
    });

    return res.json({ message: "Password reset successful" });
  }
};

export default AuthController;
