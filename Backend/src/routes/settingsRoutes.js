import express from "express";
import settingsController from "../controllers/settingsController.js";
import { authenticateJWT } from "../middleware/authMiddleware.js";

const router = express.Router();

// Authenticated user settings endpoints
router.get("/", authenticateJWT, settingsController.getSettings);
router.put("/", authenticateJWT, settingsController.updateSettings);

export default router;
