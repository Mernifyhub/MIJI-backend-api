"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding started...');
    const result = await prisma.apiProviderSetting.createMany({
        data: [
            {
                name: 'Duffel',
                slug: 'duffel',
                isActive: true,
                description: 'Duffel Flight API',
            },
            {
                name: 'Amadeus',
                slug: 'amadeus',
                isActive: true,
                description: 'Amadeus Flight API',
            },
            {
                name: 'Travelpayouts',
                slug: 'travelpayouts',
                isActive: true,
                description: 'Travelpayouts Flight API',
            },
        ],
        skipDuplicates: true,
    });
    console.log('✅ Seeding finished! Inserted:', result.count, 'records');
}
main()
    .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map