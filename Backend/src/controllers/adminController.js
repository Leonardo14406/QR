import prisma from '../../config/db.js';

export const promoteToAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await prisma.user.update({
      where: { id: userId },
      data: {
        role: 'ADMIN',
        tokenVersion: { increment: 1 } // Forces logout
      }
    });

    res.json({ message: 'User promoted to admin and sessions invalidated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};