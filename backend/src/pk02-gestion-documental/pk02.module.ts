import { Module } from '@nestjs/common';
import { Pk01Module } from '../pk01-gestion-usuarios-seguridad/pk01.module';
import { ArchivosPrivadosService } from './datos/archivos-privados.service';
import { DocumentosRepository } from './datos/documentos.repository';
import { DocumentosService } from './negocio/documentos.service';
import { DocumentosController } from './presentacion/documentos.controller';

import { ExpedientesRepository } from './datos/expedientes.repository';
import { ExpedientesService } from './negocio/expedientes.service';
import { ExpedientesController } from './presentacion/expedientes.controller';
import { AccesoDocumentalService } from './negocio/acceso-documental.service';

@Module({
  imports: [Pk01Module],
  controllers: [DocumentosController,ExpedientesController],
  providers: [ArchivosPrivadosService,DocumentosRepository,DocumentosService,AccesoDocumentalService,ExpedientesRepository,ExpedientesService],
})
export class Pk02Module {}
