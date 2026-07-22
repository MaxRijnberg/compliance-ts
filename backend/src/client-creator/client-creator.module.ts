import { Module } from '@nestjs/common';
import { PortAbleModule } from '../portable/portable.module';
import { PascalModule } from '../pascal/pascal.module';
import { ClientCreatorService } from './client-creator.service';
import { ClientCreatorController } from './client-creator.controller';

@Module({
  imports: [PortAbleModule, PascalModule],
  controllers: [ClientCreatorController],
  providers: [ClientCreatorService],
})
export class ClientCreatorModule {}
