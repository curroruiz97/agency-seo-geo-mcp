import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { decryptJSON, encryptJSON } from "../utils/crypto.js";
import { SerankingClient, type SerankingKeyClassification } from "../clients/seranking.js";

export type WordPressCredentialPayload = { username: string; applicationPassword: string };
export type SerankingCredentialPayload = { apiKey: string };
export type RankMathBridgeCredentialPayload = { bridgeToken?: string };

export class CredentialsService {
  constructor(private prisma: PrismaClient, private logger?: Logger) {}

  async setWordPress(projectId: string, payload: WordPressCredentialPayload, label = "default"): Promise<void> {
    await this.persist(projectId, "wordpress_application_password", label, payload);
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
      const perProject = await this.loadByLabel<SerankingCredentialPayload>(projectId, "seranking_token", "default");
      if (perProject) return perProject;
      const any = await this.load<SerankingCredentialPayload>(projectId, "seranking_token");
      if (any) return any;
    }
    return this.loadGlobal<SerankingCredentialPayload>("seranking_token");
  }
  async getSerankingDataApi(projectId?: string): Promise<SerankingCredentialPayload | null> {
    if (projectId) {
      const perProject = await this.loadByLabel<SerankingCredentialPayload>(projectId, "seranking_token", "data_api");
      if (perProject) return perProject;
    }
    return this.loadGlobalByLabel<SerankingCredentialPayload>("seranking_token", "data_api");
  }
  async getRankMath(projectId: string): Promise<RankMathBridgeCredentialPayload | null> {
    return this.load<RankMathBridgeCredentialPayload>(projectId, "rankmath_bridge_token");
  }
  async setSerankingDataApiGlobal(payload: SerankingCredentialPayload): Promise<void> {
    const project = await this.prisma.project.findFirst({ where: { domain: "__global__" } });
    if (!project) throw new Error("Run the seed script first to create the __global__ project.");
    await this.persist(project.id, "seranking_token", "data_api", payload);
  }

  /**
   * Auto-detect SE Ranking key type (Project vs Data) by probing both APIs,
   * then persist it under the correct label.
   *
   * - "project"  -> stored with label "default"   (account-wide credential)
   * - "data"     -> stored with label "data_api"  (account-wide credential)
   *
   * If projectId is omitted, the key is stored on the __global__ project.
   * Returns the classification so the caller can surface diagnostics.
   */
  async setSerankingAutodetect(
    payload: SerankingCredentialPayload,
    opts?: { projectId?: string }
  ): Promise<SerankingKeyClassification> {
    const classification = await SerankingClient.detectKey(payload.apiKey, this.logger);
    if (classification.keyType === "unknown") {
      throw new Error(
        `SE Ranking key not accepted by either API. ` +
        `Project probe: HTTP ${classification.probe.project.status ?? "n/a"} (${classification.probe.project.error ?? "ok"}). ` +
        `Data probe: HTTP ${classification.probe.data.status ?? "n/a"} (${classification.probe.data.error ?? "ok"}).`
      );
    }
    const label = classification.keyType === "data" ? "data_api" : "default";
    const projectId = opts?.projectId ?? await this.requireGlobalProjectId();
    await this.persist(projectId, "seranking_token", label, payload);
    this.logger?.info({ projectId, label, keyType: classification.keyType }, "SE Ranking key stored after autodetect");
    return classification;
  }

  /**
   * Build a unified SerankingClient by loading whichever keys are configured
   * for the project (project-scoped first, then global fallback).
   */
  async buildSerankingClient(projectId?: string): Promise<SerankingClient> {
    const projectKey = (await this.getSeranking(projectId))?.apiKey;
    const dataKey = (await this.getSerankingDataApi(projectId))?.apiKey;
    return new SerankingClient({ projectKey, dataKey, logger: this.logger });
  }

  private async requireGlobalProjectId(): Promise<string> {
    const project = await this.prisma.project.findFirst({ where: { domain: "__global__" } });
    if (!project) throw new Error("Run the seed script first to create the __global__ project.");
    return project.id;
  }

  private async persist(projectId: string, type: string, label: string, value: unknown): Promise<void> {
    const encryptedPayload = encryptJSON(value);
    const existing = await this.prisma.projectCredential.findFirst({
      where: { projectId, credentialType: type as never, label }
    });
    if (existing) {
      await this.prisma.projectCredential.update({
        where: { id: existing.id },
        data: { encryptedPayload, updatedAt: new Date() }
      });
    } else {
      await this.prisma.projectCredential.create({
        data: { projectId, credentialType: type as never, label, encryptedPayload }
      });
    }
  }

  private async load<T>(projectId: string, type: string): Promise<T | null> {
    const row = await this.prisma.projectCredential.findFirst({
      where: { projectId, credentialType: type as never }
    });
    if (!row?.encryptedPayload) return null;
    try { return decryptJSON<T>(row.encryptedPayload); }
    catch (e) { this.logger?.error({ projectId, type, err: String(e) }, "Failed to decrypt credential"); return null; }
  }

  private async loadByLabel<T>(projectId: string, type: string, label: string): Promise<T | null> {
    const row = await this.prisma.projectCredential.findFirst({
      where: { projectId, credentialType: type as never, label }
    });
    if (!row?.encryptedPayload) return null;
    try { return decryptJSON<T>(row.encryptedPayload); }
    catch (e) { this.logger?.error({ projectId, type, label, err: String(e) }, "Failed to decrypt credential"); return null; }
  }

  private async loadGlobal<T>(type: string): Promise<T | null> {
    const project = await this.prisma.project.findFirst({ where: { domain: "__global__" } });
    if (!project) return null;
    return this.load<T>(project.id, type);
  }
  private async loadGlobalByLabel<T>(type: string, label: string): Promise<T | null> {
    const project = await this.prisma.project.findFirst({ where: { domain: "__global__" } });
    if (!project) return null;
    return this.loadByLabel<T>(project.id, type, label);
  }
}
