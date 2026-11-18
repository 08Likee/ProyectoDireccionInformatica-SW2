import { Module } from '@nestjs/common';
import { CuentaController } from './presentacion/cuenta.controller';
import { CuentaService } from './negocio/cuenta.service';
import { CuentaRepository } from './datos/cuenta.repository';
import { CorreoService } from './negocio/correo.service';
import { LimiteService } from '../infraestructura/seguridad/limite.service';

@Module({
  controllers: [CuentaController],
  providers: [CuentaService, CuentaRepository, CorreoService, LimiteService],
})
export class Pk01Module {}
