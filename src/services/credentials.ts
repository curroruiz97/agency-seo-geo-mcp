import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { decryptJSON, encryptJSON } from "../utils/crypto.js";

export type WordPressCredentialPayload = {
  username: string;
  applicationPassword: string;
};

export type SerankingCredentialPayload = {
  apiKey: string;
};

export type RankMathBridgeCredentialPayload = {
  bridgeToken?: string;
};

/**
 * Persists credentials encrypted at rest and reads them back on demand.
 * Caller is responsible for granting access (i.e. only call after permission
 * checks; do not expose raw secrets to MCP tool responses).
 */
export class CredentialsService {
  constructor(private prisma: PrismaClient, private logger?: Logger) {}

  async setWordPress(projectId: string, payload: WordPressCredentialPayload, label = "default"): Promise<void> {
    await this.persist(projectId, "wordpress_application_password", label, payload);
  }

  async setSeranking(payload: SerankingCredentialPayload): Promise<void> {
    // SE Ranking key is account-wide; we attach it to a synthetic project record
    // using a sentinel id. Caller may pass projectId for per-project keys.
    await this.persistGlobal("seranking_token", payload);
  }

  async setSerankingForProject(projectId: string, payload: SerankingCredentialPayload, label = "default"): Promise<void> {
    await this.persist(projectId, "seranking_token", label, payload);
  }

  async setRankMath(projectId: string, payload: RankMathBridgeCredentialPayload, label = "default"): Promise<void> {
    await this.persist(projectId, "rankmath_bridge_token", label, payload);
  }

  async getWordPress(projectId: string): Promise<WordPressCredentialPayload | null> {
    return this.load<WordPressCredentialPayload>(projectId, "wordpress_application_password");
  }

  async getSeranking(projectId?: string): Promise<SerankingCredentialPayload | null> {
    if (projectId) {
      const perProject = await this.load<SerankingCredentialPayload>(projectId, "seranking_token");
      if (perProject) return perProject;
    }
    return this.loadGlobal<SerankingCredentialPayload>("seranking_token");
  }

  async getRankMath(projectId: string): Promise<RankMathBridgeCredentialPayload | null> {
    return this.load<RankMathBridgeCredentialPayload>(projectId, "rankmath_bridge_token");
  }

  private async persist(projectId: string, type: string, label: string, value: unknown): Promise<void> {
    const encryptedPayload = encryptJSON(value);
    await this.prisma.projectCredential.upsert({
      where: {
        // composite unique: projectId + credentialType + label is enforced at app level
        id: await this.findOrCreateId(projectId, type, label)
      },
      create: { projectId, credentialType: type as never, label, encryptedPayload },
      update: { encryptedPayload, updatedAt: new Date() }
    });
  }

  private async findOrCreateId(projectId: string, type: string, label: string): Promise<string> {
    const existing = await this.prisma.projectCredential.findFirst({
      where: { projectId, credentialType: type as never, label }
    });
    if (existing) return existing.id;
    const created = await this.prisma.projectCredential.create({
      data: { projectId, credentialType: type as never, label, encryptedPayload: "" }
    });
    return created.id;
  }

  private async persistGlobal(type: string, value: unknown): Promise<void> {
    // We store account-wide secrets against a deterministic singleton project
    // row called "__global__" (created lazily). This keeps the schema simple.
    const project = await this.prisma.project.findFirst({ where: { domain: "__global__" } });
    if (!project) {
      this.logger?.warn({ type }, "Global credential requested but no __global__ project exists. Create it via seed.");
      throw new Error("Run the seed script to create the __global__ project before storing account-wide credentials.");
    }
    return this.persist(project.id, type, "global", value);
  }

  private async load<T>(projectId: string, type: string): Promise<T | null> {
    const row = await this.prisma.projectCredential.findFirst({
      where: { projectId, credentialType: type as never }
    });
    if (!row?.encryptedPayload) return null;
    try {
      return decryptJSON<T>(row.encryptedPayload);
    } catch (e) {
      this.logger?.error({ projectId, type, err: String(e) }, "Failed to decrypt credential");
      return null;
    }
  }

  private async loadGlobal<T>(type: string): Promise<T | null> {
    const project = await this.prisma.project.findFirst({ where: { domain: "__global__" } });
    if (!project) return null;
    return this.load<T>(project.id, type);
  }
}
