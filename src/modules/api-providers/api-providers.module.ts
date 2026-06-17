import { Module } from '@nestjs/common';
import { ApiProvidersService } from './api-providers.service';
import { ApiProvidersController } from './api-providers.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ApiProvidersController],
  providers: [ApiProvidersService],
  exports: [ApiProvidersService], // ✅ FlightSearchService use করতে পারবে
})
export class ApiProvidersModule {}