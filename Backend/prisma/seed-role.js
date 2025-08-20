import prisma from '../config/db.js';

async function main() {
  await prisma.role.createMany({
    data: [
      { name: 'GENERATOR' },
      { name: 'RECEIVER' },
      { name: 'ADMIN' }
    ],
    skipDuplicates: true
  });
  console.log('Roles seeded');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());