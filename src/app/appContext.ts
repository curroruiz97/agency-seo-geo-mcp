import type { Logger } from "pino";
import type { AppConfig } from "../config/env.js";
import { isDatabaseUrlConfigured } from "../config/database.js";
import { createLogger } from "../utils/logger.js";
import { createMockProjectRepository, type ProjectRepository } from "../domain/projects/projectRepository.js";
import {
  createUnavailableChangeRequestRepository,
  type ChangeRequestRepository
} from "../domain/changeRequests/changeRequestRepository.js";
import { getPrismaClient } from "../db/client.js";
import { createPrismaProjectRepository } from "../db/repositories/prismaProjectRepository.js";
import { createPrismaChangeRequestRepository } from "../db/repositories/prismaChangeRequestRepository.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  repositories: {
    projects: ProjectRepository;
    changeRequests: ChangeRequestRepository;
  };
}

export function createAppContext(config: AppConfig): AppContext {
  const prisma = isDatabaseUrlConfigured(config.DATABASE_URL) ? getPrismaClient() : null;
  const projects = prisma ? createPrismaProjectRepository(prisma) : createMockProjectRepository();
  const changeRequests = prisma ? createPrismaChangeRequestRepository(prisma) : createUnavailableChangeRequestRepository();

  return {
    config,
    logger: createLogger(config),
    repositories: {
      projects,
      changeRequests
    }
  };
}
