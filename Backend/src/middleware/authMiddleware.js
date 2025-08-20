// src/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import prisma from "../../config/db.js";

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required but not set");
}

export function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.sub) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    req.userId = decoded.sub;
    req.tokenRoles = Array.isArray(decoded.roles) ? decoded.roles : [];
    req.userEmail = decoded.email || null;

    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/**
 * Authorizes by checking roles in the database (not just the JWT).
 */
export function requireRole(role) {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        include: { roles: { include: { role: true } } }
      });

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbRoles = user.roles.map((r) => r.role.name);
      if (!dbRoles.includes(role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      req.roles = dbRoles;
      return next();
    } catch (e) {
      return res.status(500).json({ message: "Server error" });
    }
  };
}
