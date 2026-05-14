export interface CreateChangeRequestInput {
  projectId: string;
  url?: string;
  targetEntityType: string;
  targetEntityId?: string;
  changeType: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  beforePayload?: Record<string, unknown>;
  afterPayload?: Record<string, unknown>;
  reason?: string;
  expectedImpact?: string;
}

export interface CreatedChangeRequest {
  id: string;
  status: string;
  projectId: string;
  changeType: string;
  riskLevel: string;
}

export interface ChangeRequestRepository {
  create(input: CreateChangeRequestInput): Promise<CreatedChangeRequest>;
}

export function createUnavailableChangeRequestRepository(): ChangeRequestRepository {
  return {
    async create() {
      throw new Error("database_not_configured");
    }
  };
}
