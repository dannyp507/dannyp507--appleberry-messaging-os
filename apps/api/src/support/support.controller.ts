import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { SupportService } from './support.service';
import { ContactFormDto } from './dto/contact-form.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('support')
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  @Public()
  @Post('contact')
  @HttpCode(200)
  async contact(@Body() dto: ContactFormDto) {
    await this.svc.sendContactEmail(dto);
    return { ok: true };
  }
}
