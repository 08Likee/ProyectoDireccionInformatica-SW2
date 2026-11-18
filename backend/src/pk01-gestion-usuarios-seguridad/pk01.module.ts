import { Module } from '@nestjs/common';
import { CuentaController } from './presentacion/cuenta.controller';
import { CuentaService } from './negocio/cuenta.service';
import { CuentaRepository } from './datos/cuenta.repository';
import { CorreoService } from './negocio/correo.service';
import { LimiteService } from '../infraestructura/seguridad/limite.service';
import { AutorizacionesController } from './presentacion/autorizaciones.controller';
import { AutorizacionesRepository } from './datos/autorizaciones.repository';
import { AutorizacionesService } from './negocio/autorizaciones.service';

@Module({
  controllers: [CuentaController, AutorizacionesController],
  providers: [CuentaService, CuentaRepository, CorreoService, LimiteService, AutorizacionesRepository, AutorizacionesService],
  exports: [AutorizacionesService],
})
export class Pk01Module {}
