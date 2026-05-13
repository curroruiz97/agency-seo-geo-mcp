import type { Logger } from "pino";
import type { AppConfig } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { createMockProjectRepository, type ProjectRepository } from "../domain/projects/projectRepository.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  repositories: {
    projects: ProjectRepository;
  };
}

export function createAppContext(config: AppConfig): AppContext {
  return {
    config,
    logger: createLogger(config),
    repositories: {
      projects: createMockProjectRepository()
    }
  };
}
