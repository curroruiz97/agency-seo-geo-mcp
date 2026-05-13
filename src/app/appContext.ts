import type { Logger } from "pino";
import type { AppConfig } from "../config/env.js";
import { isDatabaseUrlConfigured } from "../config/database.js";
import { createLogger } from "../utils/logger.js";
import { createMockProjectRepository, type ProjectRepository } from "../domain/projects/projectRepository.js";
import { getPrismaClient } from "../db/client.js";
import { createPrismaProjectRepository } from "../db/repositories/prismaProjectRepository.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  repositories: {
    projects: ProjectRepository;
  };
}

export function createAppContext(config: AppConfig): AppContext {
  const projects = isDatabaseUrlConfigured(config.DATABASE_URL)
    ? createPrismaProjectRepository(getPrismaClient())
    : createMockProjectRepository();

  return {
    config,
    logger: createLogger(config),
    repositories: {
      projects
    }
  };
}
