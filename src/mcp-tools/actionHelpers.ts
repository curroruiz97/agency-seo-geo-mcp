import { z } from "zod";
import type { AppContext } from "../app/appContext.js";
import { isDatabaseUrlConfigured } from "../config/database.js";

export const siteId = z.string().min(1).describe("Agency project/site id from list_sites or list_projects.");
export const optionalText = z.string().min(1).optional();
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date in YYYY-MM-DD format.");

export function integrationNotConfigured(context: AppContext, integration: string, action: string, extra: Record<string, unknown> = {}) {
  return {
    status: "integration_not_configured",
    integration,
    action,
    readOnly: context.config.READ_ONLY_MODE,
    message: `${integration} is not configured yet for this MCP server. The tool is published so ChatGPT can discover the action surface, but no external ${integration} request was made.`,
    nextStep: `Configure ${integration} credentials and implement the read-only client before using this action with real data.`,
    ...extra
  };
}

export async function createProposedChange(
  context: AppContext,
  input: {
    siteId: string;
    changeType: string;
    targetEntityType: string;
    targetEntityId?: string;
    url?: string;
    riskLevel?: "low" | "medium" | "high" | "critical";
    afterPayload: Record<string, unknown>;
    reason?: string;
    expectedImpact?: string;
  }
) {
  const base = {
    status: "proposed",
    externalWriteExecuted: false,
    readOnlyMode: context.config.READ_ONLY_MODE,
    message:
      "No external system was modified. This write action creates an internal proposal/change request for human approval.",
    changeType: input.changeType,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    afterPayload: input.afterPayload
  };

  if (!isDatabaseUrlConfigured(context.config.DATABASE_URL)) {
    return {
      ...base,
      persisted: false,
      persistenceStatus: "database_not_configured",
      nextStep: "Configure DATABASE_URL in the deployed PM2 environment so proposals can be stored in Supabase."
    };
  }

  try {
    const changeRequest = await context.repositories.changeRequests.create({
      projectId: input.siteId,
      url: input.url,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      changeType: input.changeType,
      riskLevel: input.riskLevel ?? "medium",
      afterPayload: input.afterPayload,
      reason: input.reason,
      expectedImpact: input.expectedImpact
    });

    return {
      ...base,
      persisted: true,
      changeRequest
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    return {
      ...base,
      persisted: false,
      persistenceStatus: "failed",
      error: message
    };
  }
}
