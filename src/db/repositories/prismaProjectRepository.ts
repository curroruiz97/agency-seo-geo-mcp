import type { PrismaClient } from "@prisma/client";
import type { ListProjectsInput, PublicProject } from "../../domain/projects/project.js";
import type { ProjectRepository } from "../../domain/projects/projectRepository.js";

export function createPrismaProjectRepository(prisma: PrismaClient): ProjectRepository {
  return {
    async list(input: ListProjectsInput): Promise<PublicProject[]> {
      const status = input.status ?? "active";
      const limit = input.limit ?? 50;

      const projects = await prisma.project.findMany({
        where: status === "all" ? undefined : { status },
        orderBy: [{ name: "asc" }],
        take: limit
      });

      return projects.map((project) => ({
        id: project.id,
        name: project.name,
        domain: project.domain,
        language: project.language,
        target_country: project.targetCountry ?? "",
        permission_level: project.permissionLevel,
        integrations: {
          wordpress: "not_configured",
          rank_math: "not_configured",
          seranking: project.serankingProjectId ? "connected" : "not_configured",
          elementor: "not_configured"
        }
      }));
    }
  };
}
