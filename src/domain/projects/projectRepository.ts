import type { ListProjectsInput, Project, PublicProject } from "./project.js";

const mockProjects: Project[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Cliente Piloto Local",
    domain: "cliente-piloto.local",
    language: "es",
    target_country: "ES",
    permission_level: "read_only",
    status: "active",
    integrations: {
      wordpress: "mock",
      rank_math: "mock",
      seranking: "mock",
      elementor: "mock_read_only"
    }
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Cliente Servicios Madrid",
    domain: "servicios-madrid.example",
    language: "es",
    target_country: "ES",
    permission_level: "proposal_only",
    status: "active",
    integrations: {
      wordpress: "mock",
      rank_math: "mock",
      seranking: "mock",
      elementor: "mock_read_only"
    }
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Cliente Pausado",
    domain: "cliente-pausado.example",
    language: "es",
    target_country: "ES",
    permission_level: "read_only",
    status: "paused",
    integrations: {
      wordpress: "mock",
      rank_math: "mock",
      seranking: "mock",
      elementor: "mock_read_only"
    }
  }
];

export interface ProjectRepository {
  list(input: ListProjectsInput): Promise<PublicProject[]>;
}

export function createMockProjectRepository(): ProjectRepository {
  return {
    async list(input) {
      const status = input.status ?? "active";
      const limit = input.limit ?? 50;
      const filtered = status === "all" ? mockProjects : mockProjects.filter((project) => project.status === status);

      return filtered.slice(0, limit).map(({ status: _status, ...project }) => project);
    }
  };
}
