import express from "express";
import qrController from "../controllers/qrController.js";
import { authenticateJWT, requireRole, requireAnyRole } from "../middleware/authMiddleware.js";
import { enforceDailyGenericQrLimit } from "../middleware/qrRateLimit.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit
// Only GENERATORs can access these endpoints
router.post(
  "/generate",
  authenticateJWT,
  requireRole("GENERATOR"),
  enforceDailyGenericQrLimit,
  qrController.generate
);
router.post("/generate-page", authenticateJWT, requireRole("GENERATOR"), qrController.generatePage);
router.post("/validate", authenticateJWT, requireAnyRole(["GENERATOR", "SCANNER", "ADMIN"]), qrController.validate);
router.post("/scan-image", authenticateJWT, requireAnyRole(["GENERATOR", "SCANNER", "ADMIN"]), upload.single("image"), qrController.scanImage);

router.get("/history", authenticateJWT, requireRole("GENERATOR"), qrController.history);
router.get("/history/:id", authenticateJWT, requireRole("GENERATOR"), qrController.getQrDetailsById);
router.delete("/history/:id", authenticateJWT, requireRole("GENERATOR"), qrController.deleteHistory);
router.get("/page/:id", qrController.renderPage);

// Real-time helpers
router.get("/active", authenticateJWT, requireRole("GENERATOR"), qrController.active);

export default router;