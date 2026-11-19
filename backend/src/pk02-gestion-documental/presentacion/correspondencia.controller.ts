import { Body,Controller,Get,Param,Patch,Post,Query,Req } from '@nestjs/common';
import type { Request } from 'express';
import { leerCookie,SESION_COOKIE } from '../../infraestructura/seguridad/csrf.guard';
import { CorrespondenciaService } from '../negocio/correspondencia.service';
@Controller('api/correspondencia')
export class CorrespondenciaController {
  constructor(private readonly servicio:CorrespondenciaService){}
  private token(req:Request){return leerCookie(req,SESION_COOKIE);}
  @Get('ambitos') ambitos(@Req() r:Request){return this.servicio.ambitos(this.token(r));}
  @Get('tipos') tipos(@Req() r:Request,@Query('direccionId') d:string){return this.servicio.catalogo(this.token(r),d,'tipos');}
  @Get('interlocutores') interlocutores(@Req() r:Request,@Query('direccionId') d:string){return this.servicio.catalogo(this.token(r),d,'interlocutores');}
  @Get('periodos') periodos(@Req() r:Request,@Query('direccionId') d:string){return this.servicio.catalogo(this.token(r),d,'periodos');}
  @Post('tipos') crearTipo(@Req() r:Request,@Body() x:unknown){return this.servicio.crearCatalogo(this.token(r),x,false);}
  @Post('interlocutores') crearInterlocutor(@Req() r:Request,@Body() x:unknown){return this.servicio.crearCatalogo(this.token(r),x,true);}
  @Get() listar(@Req() r:Request,@Query() x:unknown){return this.servicio.listar(this.token(r),x);}
  @Post() crear(@Req() r:Request,@Body() x:unknown){return this.servicio.crear(this.token(r),x);}
  @Get(':id/correcciones') correcciones(@Req() r:Request,@Param('id') id:string,@Query('direccionId') d:string){return this.servicio.correcciones(this.token(r),id,d);}
  @Get(':id') detalle(@Req() r:Request,@Param('id') id:string,@Query('direccionId') d:string){return this.servicio.detalle(this.token(r),id,d);}
  @Patch(':id') corregir(@Req() r:Request,@Param('id') id:string,@Query('direccionId') d:string,@Body() x:unknown){return this.servicio.corregir(this.token(r),id,d,x);}
  @Post(':id/documentos') vincularDoc(@Req() r:Request,@Param('id') id:string,@Query('direccionId') d:string,@Body() x:unknown){return this.servicio.vincular(this.token(r),id,d,x,true);}
  @Post(':id/expedientes') vincularExp(@Req() r:Request,@Param('id') id:string,@Query('direccionId') d:string,@Body() x:unknown){return this.servicio.vincular(this.token(r),id,d,x,false);}
  @Patch(':id/documentos/:vinculo/retirar') retirarDoc(@Req() r:Request,@Param('id') id:string,@Param('vinculo') v:string,@Query('direccionId') d:string,@Body() x:unknown){return this.servicio.retirar(this.token(r),id,d,v,x,true);}
  @Patch(':id/expedientes/:vinculo/retirar') retirarExp(@Req() r:Request,@Param('id') id:string,@Param('vinculo') v:string,@Query('direccionId') d:string,@Body() x:unknown){return this.servicio.retirar(this.token(r),id,d,v,x,false);}
}
