import prisma from "../../config/db.js";

// Per-user daily limit for generating generic QR codes
// Fallback to env DAILY_GENERIC_QR_LIMIT or 50 if no per-user setting exists
export async function enforceDailyGenericQrLimit(req, res, next) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ qr: null, message: "Unauthorized" });
    }

    // Try to read per-user settings if present
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const fallback = parseInt(process.env.DAILY_GENERIC_QR_LIMIT || "50", 10);
    const defaultLimit = Number.isFinite(fallback) ? fallback : 50;
    const userLimit = settings?.dailyGenericQrLimit ?? defaultLimit;

    // Only enforce for generic type, rolling 24-hour window
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const createdTodayCount = await prisma.qrCode.count({
      where: {
        createdBy: userId,
        type: "generic",
        createdAt: { gte: windowStart },
      },
    });

    if (createdTodayCount >= userLimit) {
      return res.status(429).json({
        qr: null,
        message: `Daily limit reached for generic QR creation (${userLimit}/day)`,
      });
    }

    return next();
  } catch (err) {
    console.error("qr rate limit error:", err);
    return res.status(500).json({ qr: null, message: "Server error" });
  }
}
