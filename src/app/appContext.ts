import type { Logger } from "pino";
import type { PrismaClient } from "@prisma/client";
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
import { CredentialsService } from "../services/credentials.js";
import { ExtractService } from "../services/extract.js";
import { StrategyService } from "../services/strategy.js";
import { ExecuteService } from "../services/execute.js";

export interface AppServices {
  credentials: CredentialsService;
  extract: ExtractService;
  strategy: StrategyService;
  execute: ExecuteService;
}

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  prisma: PrismaClient | null;
  repositories: {
    projects: ProjectRepository;
    changeRequests: ChangeRequestRepository;
  };
  services?: AppServices;
}

export function createAppContext(config: AppConfig): AppContext {
  const logger = createLogger(config);
  const prisma = isDatabaseUrlConfigured(config.DATABASE_URL) ? getPrismaClient() : null;
  const projects = prisma ? createPrismaProjectRepository(prisma) : createMockProjectRepository();
  const changeRequests = prisma ? createPrismaChangeRequestRepository(prisma) : createUnavailableChangeRequestRepository();

  let services: AppServices | undefined;
  if (prisma) {
    const credentials = new CredentialsService(prisma, logger);
    const extract = new ExtractService(prisma, credentials, logger);
    const strategy = new StrategyService(prisma, logger);
    const execute = new ExecuteService(prisma, credentials, logger);
    services = { credentials, extract, strategy, execute };
  }

  return {
    config,
    logger,
    prisma,
    repositories: { projects, changeRequests },
    services
  };
}
