import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ChangeRequestRepository,
  CreateChangeRequestInput,
  CreatedChangeRequest
} from "../../domain/changeRequests/changeRequestRepository.js";

export function createPrismaChangeRequestRepository(prisma: PrismaClient): ChangeRequestRepository {
  return {
    async create(input: CreateChangeRequestInput): Promise<CreatedChangeRequest> {
      const changeRequest = await prisma.changeRequest.create({
        data: {
          projectId: input.projectId,
          url: input.url,
          targetEntityType: input.targetEntityType,
          targetEntityId: input.targetEntityId,
          changeType: input.changeType,
          riskLevel: input.riskLevel,
          beforePayload: input.beforePayload as Prisma.InputJsonValue | undefined,
          afterPayload: input.afterPayload as Prisma.InputJsonValue | undefined,
          reason: input.reason,
          expectedImpact: input.expectedImpact,
          status: "proposed",
          requiresApproval: true
        },
        select: {
          id: true,
          status: true,
          projectId: true,
          changeType: true,
          riskLevel: true
        }
      });

      return changeRequest;
    }
  };
}
