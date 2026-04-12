import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

function refreshCookieOptions() {
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.finishAuthSession(res, this.auth.register(dto));
  }

  @Public()
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.finishAuthSession(res, this.auth.login(dto.email, dto.password));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      dto.refreshToken ?? (req.cookies?.[REFRESH_TOKEN_COOKIE] as string);
    if (!token?.trim()) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const out = await this.auth.refresh(token);
    res.cookie(REFRESH_TOKEN_COOKIE, out.refreshToken, refreshCookieOptions());
    return out;
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
    return { ok: true as const };
  }

  private async finishAuthSession(
    res: Response,
    work: Promise<{
      accessToken: string;
      refreshToken: string;
      workspaceId: string;
      organizationId: string;
      user: { id: string; email: string; name: string | null };
    }>,
  ) {
    const out = await work;
    res.cookie(REFRESH_TOKEN_COOKIE, out.refreshToken, refreshCookieOptions());
    return out;
  }
}
