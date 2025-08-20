import express from "express";
import AuthController from "../controllers/authController.js";
import { authenticateJWT } from "../middleware/authMiddleware.js";
const router = express.Router();

// Authentication routes
router.post("/login", AuthController.login);
router.post("/signup", AuthController.signup);
router.post("/logout", AuthController.logout);
router.post("/refresh-token", AuthController.refresh);
router.get("/me", authenticateJWT, AuthController.me);

// Password reset routes
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);

export default router;