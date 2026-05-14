import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { AVENUE_AI_WIDGET_URI } from "../app-ui/avenueAppResource.js";
import { jsonToolResponse } from "./response.js";

const searchOutputSchema = {
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url()
    })
  )
};

const fetchOutputSchema = {
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string().url(),
  metadata: z.record(z.string(), z.string()).optional()
};

export function registerKnowledgeTools(server: McpServer, context: AppContext) {
  server.registerTool(
    "search",
    {
      title: "Search Avenue AI knowledge",
      description:
        "Searches the Avenue AI project knowledge index and returns canonical results that ChatGPT can cite.",
      inputSchema: {
        query: z.string().min(1).describe("Search query for agency projects, domains or available SEO/GEO capabilities.")
      },
      outputSchema: searchOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true
      },
      _meta: {
        ui: { resourceUri: AVENUE_AI_WIDGET_URI, visibility: ["model", "app"] }
      }
    },
    async ({ query }) => {
      const projects = await context.repositories.projects.list({ status: "all", limit: 50 });
      const normalizedQuery = query.toLowerCase();
      const matchingProjects = projects.filter((project) =>
        [project.name, project.domain, project.language, project.target_country, project.permission_level]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      );
      const selectedProjects = matchingProjects.length > 0 ? matchingProjects : projects.slice(0, 5);
      const structuredContent = {
        results: selectedProjects.map((project) => ({
          id: project.id,
          title: project.name,
          url: projectUrl(project.domain)
        }))
      };

      return jsonToolResponse(structuredContent);
    }
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch Avenue AI project",
      description:
        "Fetches a single Avenue AI project document by id and returns text plus canonical metadata for citation.",
      inputSchema: {
        id: z.string().min(1).describe("Project id returned by the search tool.")
      },
      outputSchema: fetchOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true
      },
      _meta: {
        ui: { resourceUri: AVENUE_AI_WIDGET_URI, visibility: ["model", "app"] }
      }
    },
    async ({ id }) => {
      const projects = await context.repositories.projects.list({ status: "all", limit: 50 });
      const project = projects.find((candidate) => candidate.id === id) ?? projects[0];
      const structuredContent = project
        ? {
            id: project.id,
            title: project.name,
            text: [
              `Project: ${project.name}`,
              `Domain: ${project.domain}`,
              `Language: ${project.language}`,
              `Target country: ${project.target_country}`,
              `Permission level: ${project.permission_level}`,
              `Integrations: ${Object.entries(project.integrations)
                .map(([name, status]) => `${name}=${status}`)
                .join(", ")}`
            ].join("\n"),
            url: projectUrl(project.domain),
            metadata: {
              source: "avenue-ai-project-registry",
              language: project.language,
              target_country: project.target_country,
              permission_level: project.permission_level
            }
          }
        : {
            id,
            title: "Project not found",
            text: "No Avenue AI project matched the requested id.",
            url: context.config.PUBLIC_BASE_URL.replace(/\/$/, ""),
            metadata: { source: "avenue-ai-project-registry" }
          };

      return jsonToolResponse(structuredContent);
    }
  );
}

function projectUrl(domain: string) {
  return domain.startsWith("http://") || domain.startsWith("https://") ? domain : `https://${domain}`;
}
