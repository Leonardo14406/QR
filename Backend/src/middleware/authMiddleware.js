import jwt from "jsonwebtoken";
import prisma from "../../config/db.js";

export const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ error: "No token provided" });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = prisma.user.findUnique({
            where: {
                id: decoded.sub
            }
        });
        if (!user) {
            return res.status(401).json({ error: "Invalid token" });
        }
        req.user = user;
        next();
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to authenticate user" });
    }
};

export const adminMiddleware = (req, res, next) => {
    if(req.user.role !== "ADMIN") {
        return res.status(401).json({ error: "You are not authorized to perform this action" });
    }
    next();
}