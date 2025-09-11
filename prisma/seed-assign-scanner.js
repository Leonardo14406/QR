import prisma from '../config/db.js';

const EMAIL = process.argv[2] || 'abskargbo497@gmail.com';

async function main() {
  if (!EMAIL) {
    console.error('Usage: node prisma/seed-assign-scanner.js <email>');
    process.exit(1);
  }

  // Ensure roles exist (idempotent)
  await prisma.role.createMany({
    data: [
      { name: 'GENERATOR' },
      { name: 'RECEIVER' },
      { name: 'ADMIN' },
      { name: 'SCANNER' },
    ],
    skipDuplicates: true,
  });

  const user = await prisma.user.findUnique({ where: { email: EMAIL }, include: { roles: { include: { role: true } } } });
  if (!user) {
    console.error(`User not found for email: ${EMAIL}`);
    process.exit(1);
  }

  const scannerRole = await prisma.role.findUnique({ where: { name: 'SCANNER' } });
  if (!scannerRole) {
    throw new Error('SCANNER role not found. Did you run role seeding and migrate?');
  }

  const alreadyHas = user.roles.some((r) => r.roleId === scannerRole.id);
  if (alreadyHas) {
    console.log(`User ${EMAIL} already has SCANNER role.`);
    return;
  }

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: scannerRole.id,
    },
  });

  console.log(`Assigned SCANNER role to user ${EMAIL} (id: ${user.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
