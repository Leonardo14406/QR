// prisma/seed-admin.js
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js'; // Adjust the import path as necessary
import dotenv from 'dotenv';
dotenv.config();



const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log('Admin already exists:', ADMIN_EMAIL);
    return;
  }

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      password: hashed,
      name: 'Initial Admin',
      role: 'ADMIN',
      tokenVersion: 0
    }
  });

  console.log('Created admin:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
