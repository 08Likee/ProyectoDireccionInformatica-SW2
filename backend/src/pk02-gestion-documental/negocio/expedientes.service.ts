import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,UnauthorizedException } from '@nestjs/common';
import { QueryFailedError,QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { hashToken } from '../../infraestructura/seguridad/seguridad.util';
import { AutorizacionesService } from '../../pk01-gestion-usuarios-seguridad/negocio/autorizaciones.service';
import { DocumentosRepository } from '../datos/documentos.repository';
import { ExpedientesRepository } from '../datos/expedientes.repository';
import { AccesoDocumentalService,DOCUMENTOS_RESTRINGIDOS } from './acceso-documental.service';
import { idDocumento,textoDocumento } from './validar-archivo';
import { campos,control,opcional,validarExpediente,validarPeriodo } from './validar-expediente';
const LEER='EXPEDIENTES_CONSULTAR',GESTION='EXPEDIENTES_GESTIONAR',PERIODOS='PERIODOS_GESTIONAR',DOC='DOCUMENTOS_CONSULTAR';
@Injectable()
export class ExpedientesService {
  constructor(private readonly repo:ExpedientesRepository,private readonly documentos:DocumentosRepository,
    private readonly autorizaciones:AutorizacionesService,private readonly acceso:AccesoDocumentalService){}
  private async usuario(token:string|null){
    if(!token||! /^[A-Za-z0-9_-]{43}$/.test(token))throw new UnauthorizedException('Iniciá sesión.');
    const id=await this.documentos.sesion(hashToken(token));if(!id)throw new UnauthorizedException('Sesión no vigente.');return id;
  }
  async ambitos(token:string|null){
    const usuario=await this.usuario(token);
    const [consulta,gestion,periodos,documentos,cargaDocumental]=await Promise.all([LEER,GESTION,PERIODOS,DOC,'DOCUMENTOS_GESTIONAR'].map(p=>this.documentos.ambitos(usuario,p)));
    if(!consulta.length&&!gestion.length&&!periodos.length)throw new ForbiddenException('No contás con permisos de expedientes o periodos.');
    return {consulta,gestion,periodos,documentos,cargaDocumental};
  }
  async periodos(token:string|null,raw:unknown){
    const d=idDocumento(raw);
    if(!await this.acceso.tiene(token,LEER,d)&&!await this.acceso.tiene(token,GESTION,d))await this.autorizaciones.exigirPermiso(token,PERIODOS,d);
    return {periodos:await this.repo.periodos(d)};
  }
  private async transaccion<T>(fn:(q:QueryRunner)=>Promise<T>):Promise<T>{
    try{return await this.documentos.transaccion(fn);}catch(e){
      if(e instanceof QueryFailedError){const c=(e.driverError as {code?:string}).code;
        if(c==='23505')throw new ConflictException('Ya existe un código o vínculo activo incompatible.');
        if(c==='23503'||c==='23514')throw new BadRequestException('Referencia inválida o fuera del ámbito permitido.');}
      throw e;
    }
  }
  private async auditar(q:QueryRunner,u:string,d:string,accion:string,entidad:string,id:string,antes:unknown,despues:unknown){
    await q.query(`INSERT INTO registro_auditoria(tipo_actor,accion,tipo_entidad,identificador_entidad,origen,datos_anteriores,datos_posteriores,resultado,identificador_correlacion,id_direccion,id_usuario)
      VALUES('HUMANO',$1,$2,$3,'APLICACION',$4::jsonb,$5::jsonb,'EXITO',$6,$7,$8)`,[accion,entidad,id,JSON.stringify(antes),JSON.stringify(despues),randomUUID(),d,u]);
  }
  async crearPeriodo(token:string|null,entrada:unknown){
    const p=validarPeriodo(entrada),u=await this.usuario(token);await this.autorizaciones.exigirPermiso(token,PERIODOS,p.direccion);
    return this.transaccion(async q=>{
      await this.autorizaciones.exigirPermiso(token,PERIODOS,p.direccion,q);
      const [fila]=await q.query(`INSERT INTO periodo_academico(id_direccion,gestion,codigo_periodo,fecha_inicio,fecha_fin,creado_por)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id_periodo::text AS id`,[p.direccion,p.gestion,p.codigo,p.inicio,p.fin,u]) as Array<{id:string}>;
      await this.auditar(q,u,p.direccion,'PERIODO_CREAR','PERIODO_ACADEMICO',fila.id,null,{codigo:p.codigo,fechaInicio:p.inicio,fechaFin:p.fin});
      return {id:fila.id,mensaje:'Periodo registrado.'};
    });
  }
  async listar(token:string|null,entrada:unknown){
    const f=campos(entrada,['direccionId','busqueda','periodoId','pagina']),d=idDocumento(f.direccionId);
    await this.autorizaciones.exigirPermiso(token,LEER,d);
    if(f.pagina!==undefined&&(typeof f.pagina!=='string'||!/^\d{1,3}$/.test(f.pagina)||Number(f.pagina)>100))throw new BadRequestException('Página inválida.');
    const pagina=Number(f.pagina??0), filas=await this.repo.listar(d,opcional(f.busqueda,'Búsqueda',100),f.periodoId?idDocumento(f.periodoId):null,pagina);
    return {expedientes:filas.slice(0,20),pagina,haySiguiente:filas.length>20};
  }
  async detalle(token:string|null,raw:unknown,ambito:unknown){
    const id=idDocumento(raw),d=idDocumento(ambito);await this.autorizaciones.exigirPermiso(token,LEER,d);
    const expediente=await this.repo.expediente(id,d);if(!expediente)throw new NotFoundException('Expediente no disponible.');
    const consultaDocumental=await this.acceso.tiene(token,DOC,d);
    const vinculos=consultaDocumental?await this.repo.vinculos(id,d,await this.acceso.tiene(token,DOCUMENTOS_RESTRINGIDOS,d)):[];
    return {expediente,vinculos,consultaDocumental};
  }
  async crear(token:string|null,entrada:unknown){
    const m=validarExpediente(entrada,true),d=m.direccion!,u=await this.usuario(token);await this.autorizaciones.exigirPermiso(token,GESTION,d);
    return this.transaccion(async q=>{
      await this.autorizaciones.exigirPermiso(token,GESTION,d,q);
      const [fila]=await q.query(`INSERT INTO expediente(id_direccion,id_periodo,codigo,asunto,descripcion,creado_por,actualizado_por)
        VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id_expediente::text AS id`,[d,m.periodo,m.codigo,m.asunto,m.descripcion,u]) as Array<{id:string}>;
      await this.auditar(q,u,d,'EXPEDIENTE_CREAR','EXPEDIENTE',fila.id,null,{version:0});
      return {id:fila.id,versionControl:0,mensaje:'Expediente creado.'};
    });
  }
  private async modificar<T>(token:string|null,id:string,d:string,v:number,accion:string,fn:(q:QueryRunner,u:string)=>Promise<T>){
    const u=await this.usuario(token);await this.autorizaciones.exigirPermiso(token,GESTION,d);
    return this.transaccion(async q=>{
      const actual=await this.repo.expediente(id,d,q,true);if(!actual)throw new NotFoundException('Expediente no disponible.');
      await this.autorizaciones.exigirPermiso(token,GESTION,d,q);
      if(actual.versionControl!==v)throw new ConflictException('El expediente cambió. Consultá nuevamente el detalle.');
      const dato=await fn(q,u);
      await q.query('UPDATE expediente SET version_control=version_control+1,fecha_actualizacion=now(),actualizado_por=$2 WHERE id_expediente=$1',[id,u]);
      await this.auditar(q,u,d,accion,'EXPEDIENTE',id,{version:v},{version:v+1});
      return {dato,versionControl:v+1,mensaje:'Expediente actualizado.'};
    });
  }
  async actualizar(token:string|null,raw:unknown,ambito:unknown,entrada:unknown){
    const id=idDocumento(raw),d=idDocumento(ambito),m=validarExpediente(entrada,false);
    return this.modificar(token,id,d,m.version!,'EXPEDIENTE_ACTUALIZAR',async q=>{
      await q.query('UPDATE expediente SET id_periodo=$2,codigo=$3,asunto=$4,descripcion=$5 WHERE id_expediente=$1',[id,m.periodo,m.codigo,m.asunto,m.descripcion]);return null;
    });
  }
  async vincular(token:string|null,raw:unknown,ambito:unknown,entrada:unknown){
    const id=idDocumento(raw),d=idDocumento(ambito),x=campos(entrada,['documentoId','versionControl','versionDocumento','versionFijada','observacion','obligatorio']);
    const doc=idDocumento(x.documentoId),v=control(x.versionControl),vd=control(x.versionDocumento);
    if(x.versionFijada!==null&&(typeof x.versionFijada!=='number'||!Number.isInteger(x.versionFijada)||x.versionFijada<1||x.versionFijada>1000))throw new BadRequestException('Seleccioná una versión o vínculo dinámico.');
    if(x.obligatorio!==undefined&&typeof x.obligatorio!=='boolean')throw new BadRequestException('Obligatoriedad inválida.');
    const observacion=opcional(x.observacion,'Observación',1000);
    return this.modificar(token,id,d,v,'EXPEDIENTE_VINCULAR',async(q,u)=>{
      const documento=await this.documentos.documento(doc,d,q,true);if(!documento)throw new NotFoundException('Documento no disponible.');
      await this.acceso.exigir(token,d,doc,DOC,q);
      if(documento.versionControl!==vd)throw new ConflictException('El documento cambió. Volvé a seleccionarlo.');
      // Marcar obligatorio es una decisión expresa de gestión, nunca inferida.
      const [fila]=await q.query(`INSERT INTO expediente_documento(id_expediente,id_direccion,id_documento,numero_version_fijada,observacion,es_obligatorio,vinculado_por)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id_expediente_documento::text AS id`,[id,d,doc,x.versionFijada,observacion,x.obligatorio===true,u]) as Array<{id:string}>;
      await this.auditar(q,u,d,'EXPEDIENTE_DOCUMENTO_INCORPORAR','EXPEDIENTE_DOCUMENTO',fila.id,null,{referencia:doc,version:x.versionFijada});return fila;
    });
  }
  async retirar(token:string|null,raw:unknown,ambito:unknown,rawVinculo:unknown,entrada:unknown){
    const id=idDocumento(raw),d=idDocumento(ambito),vinculo=idDocumento(rawVinculo),x=campos(entrada,['versionControl','motivo']);
    const motivo=textoDocumento(x.motivo,'Motivo',1000,1);
    return this.modificar(token,id,d,control(x.versionControl),'EXPEDIENTE_RETIRAR_VINCULO',async(q,u)=>{
      const fila=await this.repo.vinculo(q,vinculo,id,d);if(!fila)throw new NotFoundException('Vínculo no disponible.');
      const documento=await this.documentos.documento(fila.documentoId,d,q,true);
      if(!documento)throw new NotFoundException('Documento no disponible.');
      await this.acceso.exigir(token,d,fila.documentoId,DOC,q);
      if(fila.obligatorio||fila.retiro)throw new ConflictException('El vínculo es obligatorio o ya fue retirado.');
      await q.query('UPDATE expediente_documento SET fecha_desvinculacion=now(),desvinculado_por=$2,motivo_desvinculacion=$3,numero_version_retiro=$4 WHERE id_expediente_documento=$1',[vinculo,u,motivo,fila.versionFijada??documento.versionActual]);
      await this.auditar(q,u,d,'EXPEDIENTE_DOCUMENTO_RETIRAR','EXPEDIENTE_DOCUMENTO',vinculo,null,{referencia:fila.documentoId});return null;
    });
  }
}
