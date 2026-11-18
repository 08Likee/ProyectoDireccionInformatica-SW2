import { Module } from '@nestjs/common';
import { SaludService } from './negocio/salud.service';
import { SaludController } from './presentacion/salud.controller';

@Module({
  controllers: [SaludController],
  providers: [SaludService],
})
export class SaludModule {}
