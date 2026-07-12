import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionStatus, BillingEventType } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import type { Workspace } from '@prisma/client';
import { PayfastService } from './payfast.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';

// Plans available for purchase via PayFast — ASCII only to avoid encoding mismatches
const PLAN_META: Record<string, { itemName: string; itemDescription: string }> = {
  'whatsapp-starter':   { itemName: 'WhatsApp Starter R399/mo',   itemDescription: '1 WhatsApp account, unlimited campaigns and AI' },
  'whatsapp-growth':    { itemName: 'WhatsApp Growth R699/mo',     itemDescription: '2 WhatsApp accounts, unlimited campaigns and AI' },
  'whatsapp-unlimited': { itemName: 'WhatsApp Unlimited R1200/mo', itemDescription: 'Unlimited WhatsApp accounts, campaigns and AI' },
};

@Controller('payfast')
export class PayfastController {
  private readonly logger = new Logger(PayfastController.name);

  constructor(
    private readonly payfast: PayfastService,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /payfast/payment-form?plan=whatsapp-starter
   * Returns the PayFast form action + hidden field values for a POST-based checkout.
   */
  @Get('payment-form')
  @UseGuards(WorkspaceContextGuard)
  async getPaymentForm(
    @CurrentWorkspace() workspace: Workspace,
    @Query('plan') planSlug: string,
  ) {
    const slug = planSlug || 'whatsapp-starter';
    const meta = PLAN_META[slug];
    if (!meta) throw new BadRequestException(`Unknown plan: ${slug}`);

    const plan = await this.prisma.plan.findUnique({ where: { slug } });
    if (!plan) throw new NotFoundException(`Plan "${slug}" not found in database`);

    return this.payfast.generatePaymentForm(workspace.id, {
      slug,
      amountZar: plan.priceMonthlyUsd, // field stores ZAR amount
      itemName: meta.itemName,
      itemDescription: meta.itemDescription,
    });
  }

  /**
   * POST /payfast/itn
   * PayFast Instant Transaction Notification webhook.
   * Must return HTTP 200 or PayFast will retry.
   */
  @Post('itn')
  @Public()
  @HttpCode(200)
  async handleItn(@Body() body: Record<string, string>) {
    if (!this.payfast.verifyItn(body)) {
      this.logger.warn('PayFast ITN signature verification failed');
      return { ok: false };
    }

    const workspaceId   = body.custom_str1;
    const planSlug      = body.custom_str2 || 'whatsapp-starter';
    const paymentStatus = body.payment_status;
    const payfastToken  = body.token ?? null;
    const pfPaymentId   = body.pf_payment_id ?? null;

    if (!workspaceId) {
      this.logger.warn('PayFast ITN missing custom_str1 (workspaceId)');
      return { ok: false };
    }

    if (paymentStatus === 'COMPLETE') {
      const plan = await this.prisma.plan.findUnique({ where: { slug: planSlug } });
      if (!plan) {
        this.logger.error(`Plan "${planSlug}" not found in database`);
        return { ok: false };
      }

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30);

      await this.prisma.subscription.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          externalId: pfPaymentId,
          payfastToken,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        update: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          externalId: pfPaymentId,
          payfastToken,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelledAt: null,
        },
      });

      await this.billing.recordBillingEvent(workspaceId, BillingEventType.PAYMENT_SUCCEEDED, {
        pfPaymentId, payfastToken, planSlug, amount: body.amount_gross,
      });
      this.logger.log(`PayFast COMPLETE — workspace ${workspaceId} activated on "${planSlug}"`);

    } else if (paymentStatus === 'CANCELLED') {
      // Customer cancelled their PayFast subscription
      const freePlan = await this.prisma.plan.findUnique({ where: { slug: 'free' } });
      if (freePlan) {
        await this.prisma.subscription.update({
          where: { workspaceId },
          data: {
            planId: freePlan.id,
            status: SubscriptionStatus.CANCELED,
            cancelledAt: new Date(),
          },
        });
      }
      await this.billing.recordBillingEvent(workspaceId, BillingEventType.SUBSCRIPTION_CANCELLED, {
        pfPaymentId, planSlug,
      });
      this.logger.log(`PayFast CANCELLED — workspace ${workspaceId} downgraded to free`);

    } else {
      await this.billing.recordBillingEvent(workspaceId, BillingEventType.PAYMENT_FAILED, {
        paymentStatus, pfPaymentId, planSlug,
      });
      this.logger.warn(`PayFast ${paymentStatus} — workspace ${workspaceId}`);
    }

    return { ok: true };
  }
}
