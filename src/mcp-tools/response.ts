import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function jsonToolResponse(payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}
