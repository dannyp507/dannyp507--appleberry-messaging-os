import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { SendVoucherCampaignDto } from './dto/send-voucher-campaign.dto';

@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VoucherController {
  constructor(private readonly vouchers: VoucherService) {}

  /**
   * POST /vouchers/campaign
   * Launch a voucher campaign — sends a WhatsApp interactive button message with
   * a personalised R200 voucher to each contact in the list or group.
   */
  @Post('campaign')
  @HttpCode(HttpStatus.OK)
  async sendCampaign(@Request() req: any, @Body() dto: SendVoucherCampaignDto) {
    const workspaceId: string = req.user?.workspaceId ?? req.user?.workspace?.id;
    return this.vouchers.sendCampaign(workspaceId, dto);
  }

  /**
   * GET /vouchers
   * List all vouchers for the current workspace with optional filters.
   * Query params: status, campaignName, page, pageSize
   */
  @Get()
  async list(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('campaignName') campaignName?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const workspaceId: string = req.user?.workspaceId ?? req.user?.workspace?.id;
    return this.vouchers.listVouchers(workspaceId, {
      status,
      campaignName,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    });
  }

  /**
   * GET /vouchers/redeem/:code
   * Look up a voucher by code for in-store verification before redeeming.
   */
  @Get('redeem/:code')
  async lookupCode(@Param('code') code: string) {
    return this.vouchers.getVoucherByCode(code);
  }

  /**
   * PATCH /vouchers/redeem/:code
   * Mark a voucher as REDEEMED (used in-store by staff).
   */
  @Patch('redeem/:code')
  async redeemCode(@Param('code') code: string) {
    return this.vouchers.redeemVoucher(code);
  }
}
