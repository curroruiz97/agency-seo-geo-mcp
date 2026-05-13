import { describe, expect, it } from "vitest";
import { createMockProjectRepository } from "../src/domain/projects/projectRepository.js";

describe("mock projects", () => {
  it("returns only active projects by default", async () => {
    const repository = createMockProjectRepository();
    const projects = await repository.list({});

    expect(projects).toHaveLength(2);
    expect(projects.every((project) => project.domain)).toBe(true);
  });

  it("does not expose status or credentials in the Sprint 1 output", async () => {
    const repository = createMockProjectRepository();
    const [project] = await repository.list({ status: "all", limit: 1 });

    expect(project).not.toHaveProperty("status");
    expect(project).not.toHaveProperty("credentials");
    expect(project).toHaveProperty("integrations");
  });

  it("honors limit", async () => {
    const repository = createMockProjectRepository();

    await expect(repository.list({ status: "all", limit: 2 })).resolves.toHaveLength(2);
  });
});
