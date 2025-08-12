import express from "express";
import { promoteToAdmin } from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.patch("/promote/:userId", requireAuth, requireAdmin, promoteToAdmin);

export default router;
