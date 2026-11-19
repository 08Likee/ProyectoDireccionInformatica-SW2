import { Module } from '@nestjs/common';
import { Pk01Module } from '../pk01-gestion-usuarios-seguridad/pk01.module';
import { Pk02Module } from '../pk02-gestion-documental/pk02.module';
import { ConsultasRepository } from './datos/consultas.repository';
import { ConsultasService } from './negocio/consultas.service';
import { ConsultasController } from './presentacion/consultas.controller';
@Module({imports:[Pk01Module,Pk02Module],providers:[ConsultasRepository,ConsultasService],controllers:[ConsultasController]})
export class Pk06Module {}
