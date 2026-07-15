import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PascalService } from './pascal.service';

@Module({
  imports: [HttpModule],
  providers: [PascalService],
  exports: [PascalService],
})
export class PascalModule {}
