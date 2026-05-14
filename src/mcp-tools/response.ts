import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function jsonToolResponse(payload: unknown): CallToolResult {
  const structuredContent =
    payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : { value: payload };

  return {
    structuredContent,
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent)
      }
    ]
  };
}
