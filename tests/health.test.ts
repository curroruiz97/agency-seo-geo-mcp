import { describe, expect, it } from "vitest";
import { getHealthPayload, getReadinessPayload, getRootPayload } from "../src/server/health.js";

describe("health payload", () => {
  it("returns the public health contract", () => {
    const payload = getHealthPayload({ READ_ONLY_MODE: true });

    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("agency-seo-geo-mcp");
    expect(payload.version).toBe("0.4.0");
    expect(payload.readOnly).toBe(true);
    expect(Date.parse(payload.timestamp)).not.toBeNaN();
  });

  it("returns readiness without requiring a database during Sprint 1.5", () => {
    const payload = getReadinessPayload({ DATABASE_URL: "" });

    expect(payload.status).toBe("ready");
    expect(payload.database).toBe("not_configured");
  });

  it("returns a root service directory for browser visits", () => {
    const payload = getRootPayload({
      PUBLIC_BASE_URL: "https://lava.avenuemedia.io/",
      READ_ONLY_MODE: true
    });

    expect(payload.status).toBe("ok");
    expect(payload.endpoints.mcp).toBe("https://lava.avenuemedia.io/mcp");
    expect(payload.mcp.discovery).toBe("tools/list");
    expect(payload.readOnly).toBe(true);
  });
});
