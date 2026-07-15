import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PortAbleService } from './portable.service';
import { BL_READER } from './bl-reader.interface';
import { BlReaderService } from './bl-reader.service';

@Module({
  imports: [HttpModule],
  providers: [
    PortAbleService,
    { provide: BL_READER, useClass: BlReaderService },
  ],
  exports: [PortAbleService],
})
export class PortAbleModule {}
