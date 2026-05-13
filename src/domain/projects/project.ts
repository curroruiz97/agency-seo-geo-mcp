export type ProjectStatus = "active" | "paused";
export type ProjectStatusFilter = ProjectStatus | "all";
export type PermissionLevel = "read_only" | "proposal_only" | "approved_writes";

export interface ProjectIntegrationStatus {
  wordpress: "mock" | "not_configured" | "connected" | "error";
  rank_math: "mock" | "not_configured" | "connected" | "error";
  seranking: "mock" | "not_configured" | "connected" | "error";
  elementor: "mock_read_only" | "not_configured" | "read_only" | "error";
}

export interface Project {
  id: string;
  name: string;
  domain: string;
  language: string;
  target_country: string;
  permission_level: PermissionLevel;
  status: ProjectStatus;
  integrations: ProjectIntegrationStatus;
}

export type PublicProject = Omit<Project, "status">;

export interface ListProjectsInput {
  status?: ProjectStatusFilter;
  limit?: number;
}
