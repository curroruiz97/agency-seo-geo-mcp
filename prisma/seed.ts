import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.upsert({
    where: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    update: {},
    create: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Agencia Piloto",
      companyName: "Agencia Piloto SEO/GEO",
      status: "active"
    }
  });

  const projects = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Cliente Piloto Local",
      domain: "cliente-piloto.local",
      wordpressUrl: "https://cliente-piloto.local",
      permissionLevel: "read_only" as const
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Cliente Servicios Madrid",
      domain: "servicios-madrid.example",
      wordpressUrl: "https://servicios-madrid.example",
      permissionLevel: "proposal_only" as const
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Cliente Pausado",
      domain: "cliente-pausado.example",
      wordpressUrl: "https://cliente-pausado.example",
      permissionLevel: "read_only" as const,
      status: "paused" as const
    }
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { domain: project.domain },
      update: {
        name: project.name,
        wordpressUrl: project.wordpressUrl,
        permissionLevel: project.permissionLevel,
        status: project.status ?? "active"
      },
      create: {
        ...project,
        clientId: client.id,
        status: project.status ?? "active",
        targetCountry: "ES",
        language: "es",
        capabilities: {
          create: {
            canReadWordpress: true,
            requiresHumanApproval: true,
            requiresDoubleApprovalForHighRisk: true
          }
        }
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
