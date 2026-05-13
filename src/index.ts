import { config } from "./config/env.js";
import { createAppContext } from "./app/appContext.js";
import { createHttpServer } from "./server/http.js";

const context = createAppContext(config);
const app = createHttpServer(context);
const logger = context.logger;

const server = app.listen(config.PORT, "0.0.0.0", () => {
  logger.info(
    {
      port: config.PORT,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      readOnly: config.READ_ONLY_MODE
    },
    "Agency SEO/GEO MCP server started"
  );
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "Shutting down");
  server.close((error) => {
    if (error) {
      logger.error({ error }, "Shutdown failed");
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
