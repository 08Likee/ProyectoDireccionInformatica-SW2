import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export interface ComunicacionFila {
  id:string; direccionId:string; tipoId:string; tipoNombre:string; periodoId:string|null;
  sentido:'RECIBIDA'|'EMITIDA'; referenciaOficial:string|null; asunto:string; fechaComunicacion:string;
  referencia:string; observaciones:string; remitenteId:string; destinatarioId:string; remitente:string; destinatario:string;
  versionControl:number; fechaRegistro:string; fechaActualizacion:string;
}
export interface FiltroCorrespondencia { sentido:string|null; tipoId:string|null; periodoId:string|null; desde:string|null; hasta:string|null; interlocutorId:string|null; busqueda:string; pagina:number }
const CAMPOS=`c.id_correspondencia::text AS id,c.id_direccion::text AS "direccionId",c.id_tipo_correspondencia::text AS "tipoId",t.nombre AS "tipoNombre",c.id_periodo::text AS "periodoId",
  c.sentido,c.referencia_oficial AS "referenciaOficial",c.asunto,c.fecha_comunicacion::text AS "fechaComunicacion",c.referencia,c.observaciones,
  c.id_remitente::text AS "remitenteId",c.id_destinatario::text AS "destinatarioId",r.nombre_registrado AS remitente,z.nombre_registrado AS destinatario,
  c.version_control AS "versionControl",c.fecha_registro AS "fechaRegistro",c.fecha_actualizacion AS "fechaActualizacion"`;
const FROM=`FROM correspondencia c JOIN tipo_correspondencia t USING(id_tipo_correspondencia,id_direccion)
  JOIN participacion_correspondencia r ON r.id_correspondencia=c.id_correspondencia AND r.tipo_participacion='REMITENTE'
  JOIN participacion_correspondencia z ON z.id_correspondencia=c.id_correspondencia AND z.tipo_participacion='DESTINATARIO'`;
@Injectable()
export class CorrespondenciaRepository {
  constructor(private readonly db:DataSource){}
  async tipos(d:string){return this.db.query('SELECT id_tipo_correspondencia::text AS id,codigo,nombre FROM tipo_correspondencia WHERE id_direccion=$1 ORDER BY nombre,id',[d]) as Promise<Array<{id:string;codigo:string;nombre:string}>>;}
  async interlocutores(d:string){return this.db.query('SELECT id_interlocutor::text AS id,tipo_interlocutor AS tipo,nombre_identificativo AS nombre FROM interlocutor WHERE id_direccion=$1 ORDER BY nombre_identificativo,id',[d]) as Promise<Array<{id:string;tipo:string;nombre:string}>>;}
  async direccion(q:QueryRunner,d:string){const [r]=await q.query('SELECT nombre FROM direccion_institucional WHERE id_direccion=$1 FOR UPDATE',[d]) as Array<{nombre:string}>;return r;}
  async participantes(q:QueryRunner,d:string,r:string,z:string){return q.query('SELECT id_interlocutor::text AS id,nombre_identificativo AS nombre,tipo_interlocutor AS tipo FROM interlocutor WHERE id_direccion=$1 AND id_interlocutor=ANY($2::bigint[])',[d,[r,z]]) as Promise<Array<{id:string;nombre:string;tipo:string}>>;}
  async listar(d:string,f:FiltroCorrespondencia){
    const b=`%${f.busqueda.replace(/[\\%_]/g,'\\$&')}%`;
    return this.db.query(`SELECT ${CAMPOS} ${FROM} WHERE c.id_direccion=$1 AND ($2::text IS NULL OR c.sentido=$2)
      AND ($3::bigint IS NULL OR c.id_tipo_correspondencia=$3) AND ($4::bigint IS NULL OR c.id_periodo=$4)
      AND ($5::date IS NULL OR c.fecha_comunicacion>=$5) AND ($6::date IS NULL OR c.fecha_comunicacion<=$6)
      AND ($7::bigint IS NULL OR c.id_remitente=$7 OR c.id_destinatario=$7)
      AND (c.asunto ILIKE $8 ESCAPE '\\' OR coalesce(c.referencia_oficial,'') ILIKE $8 ESCAPE '\\' OR r.nombre_registrado ILIKE $8 ESCAPE '\\' OR z.nombre_registrado ILIKE $8 ESCAPE '\\' OR ('COR-'||lpad(c.id_correspondencia::text,greatest(6,length(c.id_correspondencia::text)),'0')) ILIKE $8 ESCAPE '\\')
      ORDER BY c.fecha_comunicacion DESC,c.id_correspondencia DESC LIMIT 21 OFFSET $9`,[d,f.sentido,f.tipoId,f.periodoId,f.desde,f.hasta,f.interlocutorId,b,f.pagina*20]) as Promise<ComunicacionFila[]>;
  }
  async comunicacion(id:string,d:string,q?:QueryRunner,bloquear=false){const [r]=await (q??this.db).query(`SELECT ${CAMPOS} ${FROM} WHERE c.id_correspondencia=$1 AND c.id_direccion=$2 ${bloquear?'FOR UPDATE OF c':''}`,[id,d]) as ComunicacionFila[];return r??null;}
  async correcciones(id:string,d:string){return this.db.query(`SELECT version_anterior AS "versionAnterior",version_posterior AS "versionPosterior",motivo,datos_anteriores AS antes,datos_posteriores AS despues,corregido_por::text AS "usuarioId",fecha_correccion AS fecha FROM correspondencia_correccion WHERE id_correspondencia=$1 AND id_direccion=$2 ORDER BY version_posterior DESC`,[id,d]) as Promise<unknown[]>;}
  async documentos(id:string,d:string,restringidos:boolean){return this.db.query(`SELECT x.id_correspondencia_documento::text AS id,x.id_documento::text AS "documentoId",a.titulo,x.numero_version_fijada AS "versionFijada",v.numero_version AS "numeroVersion",v.nombre_original AS "nombreOriginal",v.tipo_mime AS "tipoMime",x.fecha_desvinculacion AS "fechaRetiro",x.motivo_desvinculacion AS "motivoRetiro"
    FROM correspondencia_documento x JOIN documento a USING(id_documento,id_direccion) JOIN version_documento v ON v.id_documento=a.id_documento AND v.numero_version=coalesce(x.numero_version_retiro,x.numero_version_fijada,a.version_actual)
    WHERE x.id_correspondencia=$1 AND x.id_direccion=$2 AND ($3::boolean OR NOT EXISTS(SELECT 1 FROM restriccion_documento r WHERE r.id_documento=a.id_documento AND r.fecha_revocacion IS NULL)) ORDER BY x.fecha_vinculacion DESC,x.id_correspondencia_documento DESC`,[id,d,restringidos]) as Promise<unknown[]>;}
  async expedientes(id:string,d:string){return this.db.query(`SELECT x.id_correspondencia_expediente::text AS id,x.id_expediente::text AS "expedienteId",e.asunto,e.codigo,x.fecha_desvinculacion AS "fechaRetiro",x.motivo_desvinculacion AS "motivoRetiro" FROM correspondencia_expediente x JOIN expediente e USING(id_expediente,id_direccion) WHERE x.id_correspondencia=$1 AND x.id_direccion=$2 ORDER BY x.fecha_vinculacion DESC,x.id_correspondencia_expediente DESC`,[id,d]) as Promise<unknown[]>;}
  async vinculo(q:QueryRunner,id:string,c:string,d:string,documental:boolean){
    const tabla=documental?'correspondencia_documento':'correspondencia_expediente',entidad=documental?'documento':'expediente';
    const [r]=await q.query(`SELECT id_${entidad}::text AS recurso,fecha_desvinculacion AS retiro,${documental?'numero_version_fijada':'NULL::integer'} AS "versionFijada" FROM ${tabla} WHERE id_${tabla}=$1 AND id_correspondencia=$2 AND id_direccion=$3 FOR UPDATE`,[id,c,d]) as Array<{recurso:string;retiro:Date|null;versionFijada:number|null}>;return r??null;
  }
}
