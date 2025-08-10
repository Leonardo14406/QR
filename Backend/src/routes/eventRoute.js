import express from "express";
import { createEvent, getEvents } from "../controllers/eventController.js";
import { authMiddleware, adminMiddleware } from "../middleware/authMiddleware.js";
const router = express.Router();

router.post("/create", authMiddleware, adminMiddleware, createEvent);
router.get("/", authMiddleware, getEvents);

export default router;