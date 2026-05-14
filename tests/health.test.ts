import { describe, expect, it } from "vitest";
import { getHealthPayload, getReadinessPayload } from "../src/server/health.js";

describe("health payload", () => {
  it("returns the public health contract", () => {
    const payload = getHealthPayload({ READ_ONLY_MODE: true });

    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("agency-seo-geo-mcp");
    expect(payload.version).toBe("0.3.1");
    expect(payload.readOnly).toBe(true);
    expect(Date.parse(payload.timestamp)).not.toBeNaN();
  });

  it("returns readiness without requiring a database during Sprint 1.5", () => {
    const payload = getReadinessPayload({ DATABASE_URL: "" });

    expect(payload.status).toBe("ready");
    expect(payload.database).toBe("not_configured");
  });
});
