#!/usr/bin/env node
/**
 * Seed script for registering 30-40 sites in bulk.
 *
 * Usage:
 *   node scripts/seed-sites.mjs path/to/sites.json
 *
 * sites.json schema:
 * [
 *   {
 *     "clientName": "Avenue Media",
 *     "clientCompany": "Avenue Media SL",
 *     "name": "Restaurante Las Acacias",
 *     "domain": "lasacacias.com",
 *     "wordpressUrl": "https://lasacacias.com",
 *     "serankingProjectId": "1234567",
 *     "language": "es",
 *     "targetCountry": "ES",
 *     "sector": "restauracion",
 *     "permissionLevel": "proposal_only",
 *     "credentials": {
 *       "wordpress": { "username": "admin", "applicationPassword": "xxxx xxxx xxxx" },
 *       "seranking": { "apiKey": "sk_xxx" }
 *     }
 *   },
 *   ...
 * ]
 *
 * Requires DATABASE_URL and SECRETS_MASTER_KEY in env.
 */
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/seed-sites.mjs <sites.json>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set.");
  process.exit(1);
}
if (!process.env.SECRETS_MASTER_KEY || process.env.SECRETS_MASTER_KEY.length < 32) {
  console.error("SECRETS_MASTER_KEY (>=32 chars) must be set.");
  process.exit(1);
}

// Inline AES-256-GCM identical to src/utils/crypto.ts (kept self-contained so this
// script can run with `node` directly without TS compilation).
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
function encryptJSON(value) {
  const masterKey = process.env.SECRETS_MASTER_KEY;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(masterKey, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ct]).toString("base64");
}

const prisma = new PrismaClient();

async function ensureClient(name, company, email) {
  const existing = await prisma.client.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.client.create({
    data: { name, companyName: company ?? null, contactEmail: email ?? null }
  });
}

async function ensureGlobalProject() {
  const existing = await prisma.project.findUnique({ where: { domain: "__global__" } });
  if (existing) return existing;
  const globalClient = await ensureClient("__global__", null, null);
  return prisma.project.create({
    data: {
      clientId: globalClient.id,
      name: "Global account-wide settings",
      domain: "__global__",
      wordpressUrl: "https://invalid.example.com",
      language: "es"
    }
  });
}

function credentialTypeFor(provider) {
  switch (provider) {
    case "wordpress": return "wordpress_application_password";
    case "seranking": return "seranking_token";
    case "rankmath": return "rankmath_bridge_token";
    default: throw new Error(`Unknown credential provider: ${provider}`);
  }
}

async function upsertCredential(projectId, provider, payload, label = "default") {
  const credentialType = credentialTypeFor(provider);
  const existing = await prisma.projectCredential.findFirst({
    where: { projectId, credentialType, label }
  });
  const encryptedPayload = encryptJSON(payload);
  if (existing) {
    return prisma.projectCredential.update({
      where: { id: existing.id },
      data: { encryptedPayload }
    });
  }
  return prisma.projectCredential.create({
    data: { projectId, credentialType, label, encryptedPayload }
  });
}

async function upsertProject(site, clientId) {
  const existing = await prisma.project.findUnique({ where: { domain: site.domain } });
  const data = {
    clientId,
    name: site.name,
    domain: site.domain,
    wordpressUrl: site.wordpressUrl,
    wordpressStagingUrl: site.wordpressStagingUrl ?? null,
    serankingProjectId: site.serankingProjectId ?? null,
    language: site.language ?? "es",
    targetCountry: site.targetCountry ?? null,
    targetCity: site.targetCity ?? null,
    sector: site.sector ?? null,
    businessType: site.businessType ?? null,
    permissionLevel: site.permissionLevel ?? "proposal_only",
    status: site.status ?? "active"
  };
  if (existing) {
    return prisma.project.update({ where: { id: existing.id }, data });
  }
  return prisma.project.create({ data });
}

async function upsertCapabilities(projectId, caps) {
  const existing = await prisma.projectCapability.findUnique({ where: { projectId } });
  const data = {
    projectId,
    canReadWordpress: caps?.canReadWordpress ?? true,
    canCreateDrafts: caps?.canCreateDrafts ?? true,
    canUpdateRankmath: caps?.canUpdateRankmath ?? true,
    canUpdateElementor: caps?.canUpdateElementor ?? false,
    canPublish: caps?.canPublish ?? false,
    canChangeSlugs: caps?.canChangeSlugs ?? false,
    canChangeCanonical: caps?.canChangeCanonical ?? false,
    canChangeRobots: caps?.canChangeRobots ?? false,
    requiresHumanApproval: caps?.requiresHumanApproval ?? true,
    requiresDoubleApprovalForHighRisk: caps?.requiresDoubleApprovalForHighRisk ?? true
  };
  if (existing) return prisma.projectCapability.update({ where: { projectId }, data });
  return prisma.projectCapability.create({ data });
}

async function main() {
  const raw = await readFile(inputPath, "utf8");
  const sites = JSON.parse(raw);
  if (!Array.isArray(sites)) {
    throw new Error("Input JSON must be an array of site objects.");
  }

  // Ensure the global container for account-wide credentials.
  const globalProject = await ensureGlobalProject();

  // If any site supplies a "seranking" key at top-level (account-wide), store on global.
  // Otherwise, per-site SE Ranking creds are stored on each project.
  let processed = 0;
  for (const site of sites) {
    const client = await ensureClient(site.clientName, site.clientCompany, site.clientEmail);
    const project = await upsertProject(site, client.id);
    await upsertCapabilities(project.id, site.capabilities);

    if (site.credentials?.wordpress) {
      await upsertCredential(project.id, "wordpress", site.credentials.wordpress);
    }
    if (site.credentials?.seranking) {
      await upsertCredential(project.id, "seranking", site.credentials.seranking);
    }
    if (site.credentials?.rankmath) {
      await upsertCredential(project.id, "rankmath", site.credentials.rankmath);
    }
    processed += 1;
    console.log(`✓ ${site.domain} → project ${project.id}`);
  }

  // Allow account-wide SE Ranking key via top-level env var as fallback.
  if (process.env.SERANKING_API_KEY) {
    // Use the same "default" label that register_seranking_key writes, so
    // CredentialsService.getSeranking resolves it consistently.
    await upsertCredential(globalProject.id, "seranking", { apiKey: process.env.SERANKING_API_KEY }, "default");
    console.log("✓ Global SE Ranking key stored on __global__ project.");
  }

  console.log(`\nSeed complete. Sites processed: ${processed}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
