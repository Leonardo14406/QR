import express from "express";
import dotenv from "dotenv";
import prisma from "../config/db.js";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import braceletRoutes from "./routes/braceletRoute.js";
import ticketRoutes from "./routes/ticketRoute.js";
import { securityMiddleware } from "./middleware/security.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import eventRoutes from "./routes/eventRoutes.js";

dotenv.config();

const app = express();

prisma.$connect();

securityMiddleware(app);
app.use('/api/', apiLimiter);
// Body parsing middleware
app.use(cookieParser());

app.use(express.json());
// Static file serving
app.use('/bracelets', express.static('public/bracelets'));
// Endpoint routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/bracelets', braceletRoutes);
app.use('/tickets', ticketRoutes);
app.use('/events', eventRoutes);

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5555;

app.listen(PORT, () => {
    console.log(`Server running on PORT: ${PORT}`);
})
