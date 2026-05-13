import { describe, expect, it } from "vitest";
import { listMockProjects } from "../src/mcp-tools/projects.fixture.js";

describe("mock projects", () => {
  it("returns only active projects by default", () => {
    const projects = listMockProjects({});

    expect(projects).toHaveLength(2);
    expect(projects.every((project) => project.domain)).toBe(true);
  });

  it("does not expose status or credentials in the Sprint 1 output", () => {
    const [project] = listMockProjects({ status: "all", limit: 1 });

    expect(project).not.toHaveProperty("status");
    expect(project).not.toHaveProperty("credentials");
    expect(project).toHaveProperty("integrations");
  });

  it("honors limit", () => {
    expect(listMockProjects({ status: "all", limit: 2 })).toHaveLength(2);
  });
});
