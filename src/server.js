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
app.use("/settings", settingsRoutes);

// Errors
app.use(errorHandler);

const PORT = process.env.PORT || 5555;
const server = app.listen(PORT, () => {
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
