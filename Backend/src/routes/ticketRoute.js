import express from "express";
import { approveTicket, createTicketAndGenerateQrCode, validateTicket, getTicketByUserId } from "../controllers/ticketController.js";
import { authMiddleware, adminMiddleware } from "../middleware/authMiddleware.js";
const router = express.Router();

router.post("/generate", authMiddleware, adminMiddleware, createTicketAndGenerateQrCode);
router.post("/validate", authMiddleware, adminMiddleware, validateTicket);
router.post("/approve", authMiddleware, adminMiddleware, approveTicket);
router.get("/", authMiddleware, getTicketByUserId);

export default router;
