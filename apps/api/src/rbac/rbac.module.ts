import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
