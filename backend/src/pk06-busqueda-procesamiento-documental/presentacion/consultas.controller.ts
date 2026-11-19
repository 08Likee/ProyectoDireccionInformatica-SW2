import { Controller,Get,Header,Param,Query,Req } from '@nestjs/common';
import type { Request } from 'express';
import { leerCookie,SESION_COOKIE } from '../../infraestructura/seguridad/csrf.guard';
import { ConsultasService } from '../negocio/consultas.service';
@Controller('api/consultas')
export class ConsultasController {
  constructor(private readonly servicio:ConsultasService){}
  private token(r:Request){return leerCookie(r,SESION_COOKIE);}
  @Get('ambitos') @Header('Cache-Control','private, no-store') ambitos(@Req() r:Request){return this.servicio.ambitos(this.token(r));}
  @Get('catalogos') @Header('Cache-Control','private, no-store') catalogos(@Req() r:Request,@Query() q:unknown){return this.servicio.catalogos(this.token(r),q);}
  @Get('registros') @Header('Cache-Control','private, no-store') listar(@Req() r:Request,@Query() q:unknown){return this.servicio.listar(this.token(r),q);}
  @Get(':fuente/:id') @Header('Cache-Control','private, no-store') detalle(@Req() r:Request,@Param('fuente') f:string,@Param('id') id:string,@Query() q:unknown){return this.servicio.detalle(this.token(r),f,id,q);}
}
