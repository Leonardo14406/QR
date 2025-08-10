import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import prisma from "../config/db.js";
import ticketRoutes from "./routes/ticketRoute.js";
import eventRoutes from "./routes/eventRoute.js";
import userRoutes from "./routes/userRoutes.js";
import helmet from "helmet";

dotenv.config();

const app = express();

prisma.$connect();

app.use(cors());
app.use(express.json());
app.use(helmet());

app.use("/api/users", userRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/events", eventRoutes);

const PORT = process.env.PORT || 5555;

app.listen(PORT, () => {
    console.log(`Server running on PORT: ${PORT}`);
})