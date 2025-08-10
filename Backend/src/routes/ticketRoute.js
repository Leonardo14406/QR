import express from "express";
import { createTicketAndGenerateQrCode, validateTicket } from "../controllers/ticketController.js";
const router = express.Router();

router.post("/generate", createTicketAndGenerateQrCode);
router.post("/validate", validateTicket);

export default router;
