import express from "express";
import { signUpUser, signInUser, updateToAdminRole } from "../controllers/userController.js";
import { authMiddleware, adminMiddleware } from "../middleware/authMiddleware.js";
const router = express.Router();

router.post("/signup", signUpUser);
router.post("/signin", authMiddleware, signInUser);
router.post("/update-to-admin", authMiddleware, adminMiddleware, updateToAdminRole);

export default router;
