import prisma from "../../config/db.js";

const settingsController = {
  // GET /settings
  async getSettings(req, res) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const settings = await prisma.userSettings.findUnique({ where: { userId } });
      const fallback = parseInt(process.env.DAILY_GENERIC_QR_LIMIT || "50", 10);
      const defaultLimit = Number.isFinite(fallback) ? fallback : 50;

      return res.json({
        settings: {
          dailyGenericQrLimit: settings?.dailyGenericQrLimit ?? defaultLimit,
        },
      });
    } catch (err) {
      console.error("getSettings error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  },

  // PUT /settings  { dailyGenericQrLimit: number }
  async updateSettings(req, res) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { dailyGenericQrLimit } = req.body;
      const parsed = Number(dailyGenericQrLimit);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ message: "dailyGenericQrLimit must be a positive number" });
      }

      const settings = await prisma.userSettings.upsert({
        where: { userId },
        update: { dailyGenericQrLimit: parsed },
        create: { userId, dailyGenericQrLimit: parsed },
      });

      return res.json({
        settings: { dailyGenericQrLimit: settings.dailyGenericQrLimit },
        message: "Settings updated",
      });
    } catch (err) {
      console.error("updateSettings error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  },
};

export default settingsController;
