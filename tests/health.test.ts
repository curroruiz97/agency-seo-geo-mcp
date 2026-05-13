import { describe, expect, it } from "vitest";
import { getHealthPayload } from "../src/server/health.js";

describe("health payload", () => {
  it("returns the public health contract", () => {
    const payload = getHealthPayload({ READ_ONLY_MODE: true });

    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("agency-seo-geo-mcp");
    expect(payload.version).toBe("0.1.0");
    expect(payload.readOnly).toBe(true);
    expect(Date.parse(payload.timestamp)).not.toBeNaN();
  });
});
