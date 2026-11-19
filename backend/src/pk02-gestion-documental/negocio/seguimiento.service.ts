import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { QueryFailedError,QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { hashToken } from '../../infraestructura/seguridad/seguridad.util';
import { AutorizacionesService } from '../../pk01-gestion-usuarios-seguridad/negocio/autorizaciones.service';
import { CorrespondenciaRepository,ComunicacionFila } from '../datos/correspondencia.repository';
import { DocumentosRepository } from '../datos/documentos.repository';
import { SeguimientoRepository } from '../datos/seguimiento.repository';
import { AccesoDocumentalService,DOCUMENTOS_RESTRINGIDOS } from './acceso-documental.service';
import { idDocumento,textoDocumento } from './validar-archivo';
import { campos,control } from './validar-expediente';
import { validarActuacion,validarSecuencia } from './validar-seguimiento';
const COR='CORRESPONDENCIA_CONSULTAR',LEER='SEGUIMIENTO_CONSULTAR',GESTION='SEGUIMIENTO_GESTIONAR',DOC='DOCUMENTOS_CONSULTAR';
@Injectable()
export class SeguimientoService {
  constructor(private readonly repo:SeguimientoRepository,private readonly corr:CorrespondenciaRepository,private readonly docs:DocumentosRepository,private readonly auth:AutorizacionesService,private readonly acceso:AccesoDocumentalService){}
  private async permisos(token:string|null,d:string,mutar=false,q?:QueryRunner){await this.auth.exigirPermiso(token,COR,d,q);await this.auth.exigirPermiso(token,LEER,d,q);if(mutar)await this.auth.exigirPermiso(token,GESTION,d,q);}
  private async usuario(token:string|null,q?:QueryRunner){if(!token||! /^[A-Za-z0-9_-]{43}$/.test(token))throw new UnauthorizedException('Iniciá sesión.');const u=await this.docs.sesion(hashToken(token),q);if(!u)throw new UnauthorizedException('Sesión no vigente.');return u;}
  async ambitos(token:string|null){const u=await this.usuario(token),[corr,leer,gestion]=await Promise.all([COR,LEER,GESTION].map(p=>this.docs.ambitos(u,p)));const consulta=leer.filter(x=>corr.some(c=>c.id===x.id));return {consulta,gestion:gestion.filter(x=>consulta.some(c=>c.id===x.id))};}
  async tipos(token:string|null,raw:unknown){const d=idDocumento(raw);await this.permisos(token,d);return {tipos:await this.repo.tipos()};}
  async detalle(token:string|null,raw:unknown,ambito:unknown){const id=idDocumento(raw),d=idDocumento(ambito);await this.permisos(token,d);const c=await this.corr.comunicacion(id,d);if(!c)throw new NotFoundException('Comunicación no disponible.');
    const movimientos=await this.repo.movimientos(id,d),consultaDocumental=await this.acceso.tiene(token,DOC,d);
    return {versionControl:c.versionControl,movimientos,relaciones:await this.repo.relaciones(id,d),situacion:movimientos.at(-1)?.estado??(movimientos.length?'SEGUIMIENTO_SIN_SITUACION':'SIN_SEGUIMIENTO'),ultimoDestino:movimientos.filter(m=>m.tipo==='DERIVACION').at(-1)?.destino??null,consultaDocumental,gestionar:await this.acceso.tiene(token,GESTION,d),evidencias:consultaDocumental?await this.repo.evidencias(id,d,await this.acceso.tiene(token,DOCUMENTOS_RESTRINGIDOS,d)):[]};}
  private async auditar(q:QueryRunner,u:string,d:string,accion:string,id:string,version:number){await q.query(`INSERT INTO registro_auditoria(tipo_actor,accion,tipo_entidad,identificador_entidad,origen,datos_posteriores,resultado,identificador_correlacion,id_direccion,id_usuario) VALUES('HUMANO',$1,'CORRESPONDENCIA',$2,'APLICACION',$3::jsonb,'EXITO',$4,$5,$6)`,[accion,id,JSON.stringify({version}),randomUUID(),d,u]);}
  private async incrementar(q:QueryRunner,id:string,u:string){await q.query('UPDATE correspondencia SET version_control=version_control+1,fecha_actualizacion=now(),actualizado_por=$2 WHERE id_correspondencia=$1',[id,u]);}
  private async modificar<T>(token:string|null,id:string,d:string,v:number,accion:string,fn:(q:QueryRunner,u:string,c:ComunicacionFila,r:ComunicacionFila|null)=>Promise<T>,relacionada:string|null=null,vr:number|null=null){await this.permisos(token,d,true);try{return await this.docs.transaccion(async q=>{
    // Mismo orden que CU-05: Dirección antes de las comunicaciones. Serializa además el grafo de relaciones.
    if(!await this.corr.direccion(q,d))throw new NotFoundException('Dirección no disponible.');
    if(id===relacionada)throw new BadRequestException('Una comunicación no puede relacionarse consigo misma.');
    const ids=relacionada?[id,relacionada]:[id];ids.sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
    const filas=new Map<string,ComunicacionFila>();for(const clave of ids){const f=await this.corr.comunicacion(clave,d,q,true);if(!f)throw new NotFoundException('Comunicación no disponible.');filas.set(clave,f);}
    await this.permisos(token,d,true,q);const u=await this.usuario(token,q),c=filas.get(id)!,r=relacionada?filas.get(relacionada)!:null;
    if(c.versionControl!==v||(r&&r.versionControl!==vr))throw new ConflictException('La comunicación cambió. Actualizá el detalle y la selección.');
    if(c.versionControl>=2147483647||(r&&r.versionControl>=2147483647))throw new ConflictException('Se alcanzó el límite de versiones de control.');
    const dato=await fn(q,u,c,r);await this.incrementar(q,id,u);await this.auditar(q,u,d,accion,id,v+1);
    if(r){await this.incrementar(q,r.id,u);await this.auditar(q,u,d,'SEGUIMIENTO_RELACION_RECIBIDA',r.id,r.versionControl+1);}
    return {dato,versionControl:v+1};
  });}catch(e){if(e instanceof QueryFailedError){const c=(e.driverError as {code?:string}).code;if(c==='23505')throw new ConflictException('Actuación o vínculo duplicado.');if(c==='23503'||c==='23514')throw new BadRequestException('Referencia o actuación inválida.');}throw e;}}
  async registrar(token:string|null,raw:unknown,ambito:unknown,entrada:unknown){const id=idDocumento(raw),d=idDocumento(ambito),m=validarActuacion(entrada);
    return this.modificar(token,id,d,m.version,'SEGUIMIENTO_REGISTRAR',async(q,u,c,r)=>{
      const historial=await this.repo.movimientos(id,d,q);validarSecuencia(m.tipo,c.sentido,m.dia,c.fechaComunicacion,m.instante,historial);
      if(m.aclarado&&!historial.some(h=>h.id===m.aclarado))throw new BadRequestException('Actuación aclarada no disponible.');
      if(r){if((m.tipo==='RESPUESTA'&&r.sentido===c.sentido)||(m.tipo==='REITERACION'&&r.sentido!==c.sentido)||r.fechaComunicacion<c.fechaComunicacion||r.fechaComunicacion>m.dia)throw new BadRequestException('Comunicación relacionada incompatible.');
        if(await this.repo.ciclo(q,d,r.id,id)||historial.some(h=>h.relacionadaId===r.id))throw new ConflictException('Relación duplicada o contradictoria.');}
      const nombres=await this.corr.participantes(q,d,m.responsable,m.destino??m.responsable),responsable=nombres.find(n=>n.id===m.responsable),destino=nombres.find(n=>n.id===m.destino);
      if(!responsable||(m.destino&&!destino))throw new BadRequestException('Responsable o destino fuera del ámbito.');
      if(historial.some(h=>h.tipo===m.tipo&&new Date(h.fecha).getTime()===m.instante.getTime()&&h.responsableId===m.responsable&&h.destinoId===m.destino&&h.observacion===m.observacion&&h.referencia===m.referencia&&h.aclaradoId===m.aclarado&&h.relacionadaId===m.relacionada))throw new ConflictException('Actuación duplicada.');
      const estado=m.tipo==='SEGUIMIENTO'||m.tipo==='ACLARACION'?historial.at(-1)?.estado??null:m.tipo;
      const [fila]=await q.query(`INSERT INTO movimiento_correspondencia(id_correspondencia,id_direccion,id_tipo_movimiento,fecha_actuacion,orden_registro,observacion,referencia,estado_resultante,id_responsable,nombre_responsable_registrado,id_destino,nombre_destino_registrado,registrado_por,id_movimiento_aclarado) VALUES($1,$2,(SELECT id_tipo_movimiento FROM tipo_movimiento_correspondencia WHERE codigo=$3),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id_movimiento::text AS id`,[id,d,m.tipo,m.instante,(historial.at(-1)?.orden??0)+1,m.observacion,m.referencia,estado,m.responsable,responsable.nombre,m.destino,destino?.nombre??null,u,m.aclarado]) as Array<{id:string}>;
      if(r)await q.query('INSERT INTO relacion_correspondencia(id_direccion,id_correspondencia_origen,id_correspondencia_relacionada,id_movimiento,tipo_relacion,registrado_por) VALUES($1,$2,$3,$4,$5,$6)',[d,id,r.id,fila.id,m.tipo,u]);return fila;
    },m.relacionada,m.versionRelacionada);}
  async vincular(token:string|null,raw:unknown,ambito:unknown,mov:unknown,entrada:unknown){const id=idDocumento(raw),d=idDocumento(ambito),movimiento=idDocumento(mov),x=campos(entrada,['documentoId','versionDocumento','versionFijada','versionControl']),doc=idDocumento(x.documentoId),vr=control(x.versionDocumento),vf=x.versionFijada;
    if(typeof vf!=='number'||!Number.isInteger(vf)||vf<1||vf>1000)throw new BadRequestException('La evidencia exige una versión fijada.');
    return this.modificar(token,id,d,control(x.versionControl),'SEGUIMIENTO_DOCUMENTO_VINCULAR',async(q,u)=>{if(!(await this.repo.movimientos(id,d,q)).some(m=>m.id===movimiento))throw new NotFoundException('Actuación no disponible.');await this.auth.exigirPermiso(token,DOC,d,q);const a=await this.docs.documento(doc,d,q,true);if(!a)throw new NotFoundException('Documento no disponible.');await this.acceso.exigir(token,d,doc,DOC,q);if(a.versionControl!==vr)throw new ConflictException('El documento cambió. Volvé a seleccionarlo.');const [v]=await q.query('INSERT INTO movimiento_documento(id_movimiento,id_direccion,id_documento,numero_version_fijada,vinculado_por) VALUES($1,$2,$3,$4,$5) RETURNING id_movimiento_documento::text AS id',[movimiento,d,doc,vf,u]) as Array<{id:string}>;return v;});}
  async retirar(token:string|null,raw:unknown,ambito:unknown,mov:unknown,vin:unknown,entrada:unknown){const id=idDocumento(raw),d=idDocumento(ambito),movimiento=idDocumento(mov),vinculo=idDocumento(vin),x=campos(entrada,['versionControl','motivo']),motivo=textoDocumento(x.motivo,'Motivo',1000,1);
    return this.modificar(token,id,d,control(x.versionControl),'SEGUIMIENTO_DOCUMENTO_RETIRAR',async(q,u)=>{await this.auth.exigirPermiso(token,DOC,d,q);const [a]=await q.query(`SELECT x.id_documento::text AS documento,x.fecha_desvinculacion AS retiro FROM movimiento_documento x JOIN movimiento_correspondencia m USING(id_movimiento,id_direccion) WHERE x.id_movimiento_documento=$1 AND x.id_movimiento=$2 AND m.id_correspondencia=$3 AND x.id_direccion=$4 FOR UPDATE OF x`,[vinculo,movimiento,id,d]) as Array<{documento:string;retiro:Date|null}>;if(!a)throw new NotFoundException('Vínculo no disponible.');if(!await this.docs.documento(a.documento,d,q,true))throw new NotFoundException('Documento no disponible.');await this.acceso.exigir(token,d,a.documento,DOC,q);if(a.retiro)throw new ConflictException('Vínculo ya retirado.');await q.query('UPDATE movimiento_documento SET fecha_desvinculacion=now(),desvinculado_por=$2,motivo_desvinculacion=$3 WHERE id_movimiento_documento=$1',[vinculo,u,motivo]);return null;});}
}
