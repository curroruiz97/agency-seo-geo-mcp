import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { dateString, integrationNotConfigured } from "./actionHelpers.js";
import { jsonToolResponse } from "./response.js";

export function registerGoogleSearchConsoleTools(server: McpServer, context: AppContext) {
  server.tool("gsc_list_properties", "Lista propiedades de Google Search Console configuradas.", {}, async () =>
    jsonToolResponse(integrationNotConfigured(context, "google_search_console", "gsc_list_properties"))
  );

  server.tool(
    "gsc_get_search_performance",
    "Devuelve clics, impresiones, CTR y posicion media desde Google Search Console.",
    {
      property_id: z.string().min(1),
      start_date: dateString(),
      end_date: dateString(),
      dimensions: z.array(z.enum(["query", "page", "country", "device", "date"])).optional(),
      filters: z.record(z.unknown()).optional()
    },
    async (input) =>
      jsonToolResponse(integrationNotConfigured(context, "google_search_console", "gsc_get_search_performance", input))
  );

  server.tool(
    "gsc_get_page_queries",
    "Devuelve queries que traen trafico organico a una URL concreta.",
    { property_id: z.string().min(1), page_url: z.string().url(), start_date: dateString(), end_date: dateString() },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "google_search_console", "gsc_get_page_queries", input))
  );

  server.tool(
    "gsc_get_query_pages",
    "Devuelve paginas que posicionan para una query concreta.",
    { property_id: z.string().min(1), query: z.string().min(1), start_date: dateString(), end_date: dateString() },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "google_search_console", "gsc_get_query_pages", input))
  );

  server.tool(
    "gsc_get_index_coverage",
    "Devuelve estado de cobertura/indexacion de Google Search Console cuando este disponible.",
    { property_id: z.string().min(1), page_url: z.string().url().optional() },
    async (input) =>
      jsonToolResponse(integrationNotConfigured(context, "google_search_console", "gsc_get_index_coverage", input))
  );

  server.tool(
    "gsc_inspect_url",
    "Inspecciona una URL con Google Search Console URL Inspection API cuando este configurada.",
    { property_id: z.string().min(1), page_url: z.string().url() },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "google_search_console", "gsc_inspect_url", input))
  );
}

export function registerGoogleAnalyticsTools(server: McpServer, context: AppContext) {
  server.tool("ga_list_properties", "Lista propiedades de Google Analytics configuradas.", {}, async () =>
    jsonToolResponse(integrationNotConfigured(context, "google_analytics", "ga_list_properties"))
  );

  server.tool(
    "ga_get_traffic_overview",
    "Devuelve resumen de trafico de Google Analytics.",
    { property_id: z.string().min(1), start_date: dateString(), end_date: dateString() },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "google_analytics", "ga_get_traffic_overview", input))
  );

  server.tool(
    "ga_get_landing_pages",
    "Devuelve landing pages principales desde Google Analytics.",
    {
      property_id: z.string().min(1),
      start_date: dateString(),
      end_date: dateString(),
      limit: z.number().int().positive().max(500).optional().default(100)
    },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "google_analytics", "ga_get_landing_pages", input))
  );

  server.tool(
    "ga_get_engagement_metrics",
    "Devuelve metricas de engagement de Google Analytics.",
    {
      property_id: z.string().min(1),
      start_date: dateString(),
      end_date: dateString(),
      page_url: z.string().url().optional()
    },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "google_analytics", "ga_get_engagement_metrics", input))
  );

  server.tool(
    "ga_get_conversions",
    "Devuelve conversiones de Google Analytics.",
    { property_id: z.string().min(1), start_date: dateString(), end_date: dateString() },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "google_analytics", "ga_get_conversions", input))
  );

  server.tool(
    "ga_get_channel_performance",
    "Devuelve rendimiento por canal de adquisicion en Google Analytics.",
    { property_id: z.string().min(1), start_date: dateString(), end_date: dateString() },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "google_analytics", "ga_get_channel_performance", input))
  );
}
