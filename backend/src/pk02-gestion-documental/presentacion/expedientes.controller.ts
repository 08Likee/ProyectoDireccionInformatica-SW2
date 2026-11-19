import { Body,Controller,Get,Param,Patch,Post,Query,Req } from '@nestjs/common';
import type { Request } from 'express';
import { leerCookie,SESION_COOKIE } from '../../infraestructura/seguridad/csrf.guard';
import { ExpedientesService } from '../negocio/expedientes.service';
@Controller('api')
export class ExpedientesController {
  constructor(private readonly servicio:ExpedientesService){}
  private token(req:Request){return leerCookie(req,SESION_COOKIE);}
  @Get('expedientes/ambitos') ambitos(@Req() req:Request){return this.servicio.ambitos(this.token(req));}
  @Get('periodos') periodos(@Req() req:Request,@Query('direccionId') d:string){return this.servicio.periodos(this.token(req),d);}
  @Post('periodos') crearPeriodo(@Req() req:Request,@Body() datos:unknown){return this.servicio.crearPeriodo(this.token(req),datos);}
  @Get('expedientes') listar(@Req() req:Request,@Query() filtros:unknown){return this.servicio.listar(this.token(req),filtros);}
  @Post('expedientes') crear(@Req() req:Request,@Body() datos:unknown){return this.servicio.crear(this.token(req),datos);}
  @Get('expedientes/:id') detalle(@Req() req:Request,@Param('id') id:string,@Query('direccionId') d:string){return this.servicio.detalle(this.token(req),id,d);}
  @Patch('expedientes/:id') actualizar(@Req() req:Request,@Param('id') id:string,@Query('direccionId') d:string,@Body() datos:unknown){return this.servicio.actualizar(this.token(req),id,d,datos);}
  @Post('expedientes/:id/documentos') vincular(@Req() req:Request,@Param('id') id:string,@Query('direccionId') d:string,@Body() datos:unknown){return this.servicio.vincular(this.token(req),id,d,datos);}
  @Patch('expedientes/:id/documentos/:vinculo/retirar') retirar(@Req() req:Request,@Param('id') id:string,@Param('vinculo') v:string,@Query('direccionId') d:string,@Body() datos:unknown){return this.servicio.retirar(this.token(req),id,d,v,datos);}
}
