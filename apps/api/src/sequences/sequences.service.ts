import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DripEnrollmentStatus, DripSequenceStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  DRIP_SEQUENCES_QUEUE,
  MESSAGES_SEND_QUEUE,
  type DripSequenceJob,
  type SendMessageJob,
} from '../queue/queue.constants';
import type { CreateSequenceDto } from './dto/create-sequence.dto';
import type { EnrollDto } from './dto/enroll.dto';

@Injectable()
export class SequencesService {
  private readonly logger = new Logger(SequencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DRIP_SEQUENCES_QUEUE) private readonly dripQueue: Queue,
    @InjectQueue(MESSAGES_SEND_QUEUE) private readonly msgQueue: Queue,
  ) {}

  // ─── Sequences CRUD ──────────────────────────────────────────────────────────

  async listSequences(workspaceId: string) {
    return this.prisma.dripSequence.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { steps: true, enrollments: true } },
      },
    });
  }

  async getSequence(workspaceId: string, id: string) {
    const seq = await this.prisma.dripSequence.findFirst({
      where: { id, workspaceId },
      include: {
        steps: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!seq) throw new NotFoundException('Sequence not found');
    return seq;
  }

  async createSequence(workspaceId: string, dto: CreateSequenceDto) {
    return this.prisma.dripSequence.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        steps: dto.steps?.length
          ? {
              create: dto.steps.map((s) => ({
                sortOrder: s.sortOrder,
                delayDays: s.delayDays,
                delayHours: s.delayHours,
                message: s.message ?? null,
                templateId: s.templateId ?? null,
              })),
            }
          : undefined,
      },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateSequence(
    workspaceId: string,
    id: string,
    dto: Partial<CreateSequenceDto> & { status?: DripSequenceStatus },
  ) {
    await this._assertOwns(workspaceId, id);
    return this.prisma.dripSequence.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async deleteSequence(workspaceId: string, id: string) {
    await this._assertOwns(workspaceId, id);
    await this.prisma.dripSequence.delete({ where: { id } });
    return { success: true };
  }

  // ─── Steps ───────────────────────────────────────────────────────────────────

  async upsertStep(
    workspaceId: string,
    sequenceId: string,
    stepData: {
      id?: string;
      sortOrder: number;
      delayDays: number;
      delayHours: number;
      message?: string;
      templateId?: string;
    },
  ) {
    await this._assertOwns(workspaceId, sequenceId);

    if (stepData.id) {
      return this.prisma.dripStep.update({
        where: { id: stepData.id },
        data: {
          sortOrder: stepData.sortOrder,
          delayDays: stepData.delayDays,
          delayHours: stepData.delayHours,
          message: stepData.message ?? null,
          templateId: stepData.templateId ?? null,
        },
      });
    }

    return this.prisma.dripStep.create({
      data: {
        sequenceId,
        sortOrder: stepData.sortOrder,
        delayDays: stepData.delayDays,
        delayHours: stepData.delayHours,
        message: stepData.message ?? null,
        templateId: stepData.templateId ?? null,
      },
    });
  }

  async deleteStep(workspaceId: string, sequenceId: string, stepId: string) {
    await this._assertOwns(workspaceId, sequenceId);
    await this.prisma.dripStep.delete({ where: { id: stepId } });
    return { success: true };
  }

  // ─── Enrollments ─────────────────────────────────────────────────────────────

  async enroll(workspaceId: string, sequenceId: string, dto: EnrollDto) {
    const seq = await this._assertOwns(workspaceId, sequenceId);

    if (seq.status !== DripSequenceStatus.ACTIVE) {
      throw new BadRequestException('Sequence is not active');
    }

    const steps = await this.prisma.dripStep.findMany({
      where: { sequenceId },
      orderBy: { sortOrder: 'asc' },
    });
    if (!steps.length) throw new BadRequestException('Sequence has no steps');

    const firstStep = steps[0];
    const delayMs =
      (firstStep.delayDays * 24 * 60 * 60 + firstStep.delayHours * 3600) *
      1000;
    const nextSendAt = new Date(Date.now() + delayMs);

    const results: {
      subscriptionId: string;
      enrolled: boolean;
      reason?: string;
    }[] = [];

    for (const subscriptionId of dto.subscriptionIds) {
      const sub = await this.prisma.contactSubscription.findFirst({
        where: { id: subscriptionId, workspaceId },
      });
      if (!sub) {
        results.push({ subscriptionId, enrolled: false, reason: 'Not found' });
        continue;
      }

      const enrollment = await this.prisma.dripEnrollment.upsert({
        where: {
          contactSubscriptionId_sequenceId: {
            contactSubscriptionId: subscriptionId,
            sequenceId,
          },
        },
        create: {
          workspaceId,
          contactSubscriptionId: subscriptionId,
          sequenceId,
          whatsappAccountId: dto.whatsappAccountId,
          nextStepOrder: firstStep.sortOrder,
          nextSendAt,
        },
        update: {
          status: DripEnrollmentStatus.ACTIVE,
          whatsappAccountId: dto.whatsappAccountId,
          nextStepOrder: firstStep.sortOrder,
          nextSendAt,
          completedAt: null,
        },
      });

      // Remove any existing pending job for this enrollment then re-add
      try {
        const existing = await this.dripQueue.getJob(`drip-${enrollment.id}`);
        if (existing) await existing.remove();
      } catch {
        // ignore if job doesn't exist
      }

      await this.dripQueue.add(
        'send-step',
        { enrollmentId: enrollment.id } satisfies DripSequenceJob,
        { delay: delayMs, jobId: `drip-${enrollment.id}` },
      );

      results.push({ subscriptionId, enrolled: true });
    }

    return results;
  }

  async cancelEnrollment(workspaceId: string, enrollmentId: string) {
    const enrollment = await this.prisma.dripEnrollment.findFirst({
      where: { id: enrollmentId, workspaceId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    try {
      const job = await this.dripQueue.getJob(`drip-${enrollmentId}`);
      if (job) await job.remove();
    } catch {
      // ignore
    }

    return this.prisma.dripEnrollment.update({
      where: { id: enrollmentId },
      data: { status: DripEnrollmentStatus.CANCELLED },
    });
  }

  /** Cancel all ACTIVE enrollments for a contact subscription (e.g. on STOP keyword). */
  async cancelSubscriptionEnrollments(
    workspaceId: string,
    subscriptionId: string,
  ): Promise<number> {
    const active = await this.prisma.dripEnrollment.findMany({
      where: {
        workspaceId,
        contactSubscriptionId: subscriptionId,
        status: DripEnrollmentStatus.ACTIVE,
      },
      select: { id: true },
    });

    for (const { id } of active) {
      try {
        const job = await this.dripQueue.getJob(`drip-${id}`);
        if (job) await job.remove();
      } catch {
        // ignore missing jobs
      }
    }

    if (active.length > 0) {
      await this.prisma.dripEnrollment.updateMany({
        where: {
          id: { in: active.map((e) => e.id) },
        },
        data: { status: DripEnrollmentStatus.CANCELLED },
      });
    }

    return active.length;
  }

  async listEnrollments(workspaceId: string, sequenceId: string) {
    await this._assertOwns(workspaceId, sequenceId);
    return this.prisma.dripEnrollment.findMany({
      where: { workspaceId, sequenceId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        contactSubscription: {
          include: {
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
      },
    });
  }

  // ─── Step executor (called by the drip processor) ────────────────────────────

  async executeStep(enrollmentId: string): Promise<void> {
    const enrollment = await this.prisma.dripEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        sequence: { include: { steps: { orderBy: { sortOrder: 'asc' } } } },
        contactSubscription: { include: { contact: true } },
        whatsappAccount: true,
      },
    });

    if (!enrollment) {
      this.logger.warn(`Enrollment ${enrollmentId} not found`);
      return;
    }
    if (enrollment.status !== DripEnrollmentStatus.ACTIVE) {
      this.logger.log(
        `Enrollment ${enrollmentId} is ${enrollment.status} — skipping`,
      );
      return;
    }

    const steps = enrollment.sequence.steps;
    const currentStep = steps.find(
      (s) => s.sortOrder === enrollment.nextStepOrder,
    );

    if (!currentStep) {
      await this.prisma.dripEnrollment.update({
        where: { id: enrollmentId },
        data: { status: DripEnrollmentStatus.COMPLETED, completedAt: new Date() },
      });
      return;
    }

    const contact = enrollment.contactSubscription.contact;
    const message = (
      currentStep.message ?? `Step ${currentStep.sortOrder}`
    ).replace(/\{\{name\}\}/gi, contact.firstName);

    // Create MessageLog + enqueue send
    const log = await this.prisma.messageLog.create({
      data: {
        workspaceId: enrollment.workspaceId,
        contactId: contact.id,
        channel: 'WHATSAPP',
        whatsappAccountId: enrollment.whatsappAccountId,
        message,
        status: 'PENDING',
        provider: enrollment.whatsappAccount.providerType,
      },
    });

    await this.msgQueue.add('send', {
      messageLogId: log.id,
      to: contact.phone,
      message,
      workspaceId: enrollment.workspaceId,
      accountId: enrollment.whatsappAccountId,
    } satisfies SendMessageJob);

    // Advance to next step
    const nextStep = steps.find((s) => s.sortOrder > currentStep.sortOrder);

    if (!nextStep) {
      await this.prisma.dripEnrollment.update({
        where: { id: enrollmentId },
        data: { status: DripEnrollmentStatus.COMPLETED, completedAt: new Date() },
      });
      return;
    }

    const delayMs =
      (nextStep.delayDays * 24 * 60 * 60 + nextStep.delayHours * 3600) * 1000;

    await this.prisma.dripEnrollment.update({
      where: { id: enrollmentId },
      data: {
        nextStepOrder: nextStep.sortOrder,
        nextSendAt: new Date(Date.now() + delayMs),
      },
    });

    await this.dripQueue.add(
      'send-step',
      { enrollmentId } satisfies DripSequenceJob,
      { delay: delayMs, jobId: `drip-${enrollmentId}` },
    );

    this.logger.log(
      `Drip ${enrollmentId}: sent step ${currentStep.sortOrder}, next in ${delayMs}ms`,
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async _assertOwns(workspaceId: string, id: string) {
    const seq = await this.prisma.dripSequence.findFirst({
      where: { id, workspaceId },
    });
    if (!seq) throw new NotFoundException('Sequence not found');
    return seq;
  }
}
