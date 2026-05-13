import { config } from "./config/env.js";
import { createHttpServer } from "./server/http.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger(config);
const app = createHttpServer(config);

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
