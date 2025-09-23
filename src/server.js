// src/index.js
import express from "express";
import dotenv from "dotenv";
import prisma from "../config/db.js";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import { securityMiddleware } from "./middleware/security.js";
import { errorHandler } from "./middleware/errorHandler.js";
//import { apiLimiter } from "./middleware/rateLimiter.js";
import qrRoutes from "./routes/qrRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import http from "http";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";

dotenv.config();

// Fail fast on missing secrets
const requiredEnv = ["JWT_SECRET", "DATABASE_URL"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const app = express();

// Connect DB
await prisma.$connect();

// Security first
securityMiddleware(app);

// Rate limiting
//app.use("/", apiLimiter);

// Cookies & JSON
app.use(cookieParser());
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/qr", qrRoutes);
//app.use("/settings", settingsRoutes);

// Errors
app.use(errorHandler);

// --- Real-time (Socket.IO) setup ---
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Make io available to route handlers/controllers via req.app.get('io')
app.set("io", io);

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(); // Allow anonymous (will just not join a user room)
    const payload = jwt.verify(String(token), process.env.JWT_SECRET);
    socket.data.userId = payload?.sub || payload?.id || payload?.userId;
    return next();
  } catch (err) {
    // Invalid token: continue without a user context
    return next();
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  if (userId) {
    socket.join(`user:${userId}`);
  }
  socket.on("disconnect", () => {
    // no-op; room cleanup is automatic
  });
});

const PORT = process.env.PORT || 5555;
server.listen(PORT, () => {
  console.log(`Server running on PORT: ${PORT}`);
});

// Graceful shutdown
const shutdown = async () => {
  try {
    await prisma.$disconnect();
  } finally {
    server.close(() => process.exit(0));
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
