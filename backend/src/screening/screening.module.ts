import { Module } from '@nestjs/common';
import { PortAbleModule } from '../portable/portable.module';
import { PascalModule } from '../pascal/pascal.module';
import { SeaSearcherModule } from '../seasearcher/seasearcher.module';
import { BlReaderService } from '../portable/bl-reader.service';
import { ScreeningService } from './screening.service';
import { ScreeningController } from './screening.controller';

@Module({
  imports: [PortAbleModule, PascalModule, SeaSearcherModule],
  controllers: [ScreeningController],
  providers: [ScreeningService, BlReaderService],
})
export class ScreeningModule {}
