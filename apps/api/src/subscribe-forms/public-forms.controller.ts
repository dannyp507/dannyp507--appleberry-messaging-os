import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SubscribeFormsService } from './subscribe-forms.service';
import { SubmitFormDto } from './dto/submit-form.dto';

@Controller('public/forms')
export class PublicFormsController {
  constructor(private readonly service: SubscribeFormsService) {}

  /** Returns the public-safe config for rendering the form. */
  @Public()
  @Get(':slug')
  config(@Param('slug') slug: string) {
    return this.service.getPublicConfig(slug);
  }

  /** Processes a form submission — no auth required. */
  @Public()
  @Post(':slug/submit')
  submit(@Param('slug') slug: string, @Body() dto: SubmitFormDto) {
    return this.service.submit(slug, dto);
  }
}
