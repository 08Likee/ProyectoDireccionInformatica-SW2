import { Module } from '@nestjs/common';
import { Pk01Module } from '../pk01-gestion-usuarios-seguridad/pk01.module';
import { ArchivosPrivadosService } from './datos/archivos-privados.service';
import { DocumentosRepository } from './datos/documentos.repository';
import { DocumentosService } from './negocio/documentos.service';
import { DocumentosController } from './presentacion/documentos.controller';

@Module({
  imports: [Pk01Module],
  controllers: [DocumentosController],
  providers: [ArchivosPrivadosService,DocumentosRepository,DocumentosService],
})
export class Pk02Module {}
