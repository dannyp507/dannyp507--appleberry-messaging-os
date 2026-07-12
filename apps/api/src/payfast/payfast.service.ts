import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface PayfastPlanParams {
  slug: string;
  amountZar: number;
  itemName: string;
  itemDescription: string;
}

export interface PayfastFormPayload {
  action: string;
  fields: Record<string, string>;
}

@Injectable()
export class PayfastService {
  private readonly logger = new Logger(PayfastService.name);

  private readonly merchantId: string;
  private readonly merchantKey: string;
  private readonly passphrase: string;
  private readonly returnUrl: string;
  private readonly cancelUrl: string;
  private readonly notifyUrl: string;
  private readonly payfastUrl = 'https://www.payfast.co.za/eng/process';

  constructor(private readonly config: ConfigService) {
    this.merchantId  = config.getOrThrow('PAYFAST_MERCHANT_ID');
    this.merchantKey = config.getOrThrow('PAYFAST_MERCHANT_KEY');
    this.passphrase  = config.get('PAYFAST_PASSPHRASE') ?? '';
    this.returnUrl   = config.getOrThrow('PAYFAST_RETURN_URL');
    this.cancelUrl   = config.getOrThrow('PAYFAST_CANCEL_URL');
    this.notifyUrl   = config.getOrThrow('PAYFAST_NOTIFY_URL');
  }

  generatePaymentForm(workspaceId: string, plan: PayfastPlanParams): PayfastFormPayload {
    const amount = plan.amountZar.toFixed(2);
    // Field order must match PayFast's canonical order from Auth::generateSignature()
    // (https://github.com/Payfast/payfast-php-sdk/blob/HEAD/lib/Auth.php)
    // recurring_amount MUST come before frequency and cycles — PayFast verifies in this order.
    const params: Record<string, string> = {
      merchant_id:       this.merchantId,
      merchant_key:      this.merchantKey,
      return_url:        this.returnUrl,
      cancel_url:        this.cancelUrl,
      notify_url:        this.notifyUrl,
      m_payment_id:      `ws-${workspaceId}-${Date.now()}`,
      amount,
      item_name:         plan.itemName,
      item_description:  plan.itemDescription,
      custom_str1:       workspaceId,
      custom_str2:       plan.slug,
      subscription_type: '1',
      recurring_amount:  amount,
      frequency:         '3',
      cycles:            '0',
    };

    const { signature, signString } = this.buildSignature(params);
    this.logger.log(`[PayFast] sign-string: ${signString}`);
    this.logger.log(`[PayFast] signature: ${signature}`);

    return {
      action: this.payfastUrl,
      fields: { ...params, signature },
    };
  }

  verifyItn(body: Record<string, string>): boolean {
    const received = body.signature;
    if (!received) return false;

    const copy = { ...body };
    delete copy.signature;

    const { signature: computed } = this.buildSignature(copy);
    return received === computed;
  }

  private buildSignature(params: Record<string, string>): { signature: string; signString: string } {
    const enc = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');

    // PayFast payment-page verification sorts all fields alphabetically with the passphrase
    // included in the sorted set (as per the official @payfast/core Node.js library and the
    // WooCommerce plugin's sort-before-merge mode).
    const pfData: Record<string, string> = { ...params };
    if (this.passphrase) pfData['passphrase'] = this.passphrase;

    const signString = Object.keys(pfData)
      .sort()
      .filter((k) => pfData[k] !== '' && pfData[k] !== undefined)
      .map((k) => `${k}=${enc(pfData[k])}`)
      .join('&');

    return { signature: crypto.createHash('md5').update(signString).digest('hex'), signString };
  }
}
