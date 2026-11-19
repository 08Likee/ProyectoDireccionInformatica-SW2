import { Injectable } from '@nestjs/common';
import { DataSource,QueryRunner } from 'typeorm';
export interface MovimientoFila {id:string;orden:number;tipo:string;fecha:Date;registro:Date;responsable:string;responsableId:string;destino:string|null;destinoId:string|null;observacion:string;referencia:string;aclaradoId:string|null;usuarioId:string;estado:string|null;relacionadaId:string|null;relacionadaAsunto:string|null;}
@Injectable()
export class SeguimientoRepository {
  constructor(private readonly db:DataSource){}
  async tipos(){return this.db.query('SELECT codigo,nombre FROM tipo_movimiento_correspondencia ORDER BY id_tipo_movimiento') as Promise<Array<{codigo:string;nombre:string}>>;}
  async movimientos(id:string,d:string,q?:QueryRunner){return (q??this.db).query(`SELECT m.id_movimiento::text AS id,m.orden_registro AS orden,t.codigo AS tipo,m.fecha_actuacion AS fecha,m.fecha_registro AS registro,m.nombre_responsable_registrado AS responsable,m.id_responsable::text AS "responsableId",m.nombre_destino_registrado AS destino,m.id_destino::text AS "destinoId",m.observacion,m.referencia,m.id_movimiento_aclarado::text AS "aclaradoId",m.registrado_por::text AS "usuarioId",m.estado_resultante AS estado,r.id_correspondencia_relacionada::text AS "relacionadaId",c.asunto AS "relacionadaAsunto"
    FROM movimiento_correspondencia m JOIN tipo_movimiento_correspondencia t USING(id_tipo_movimiento) LEFT JOIN relacion_correspondencia r USING(id_movimiento) LEFT JOIN correspondencia c ON c.id_correspondencia=r.id_correspondencia_relacionada AND c.id_direccion=m.id_direccion
    WHERE m.id_correspondencia=$1 AND m.id_direccion=$2 ORDER BY m.orden_registro`,[id,d]) as Promise<MovimientoFila[]>;}
  async relaciones(id:string,d:string){return this.db.query(`SELECT r.id_correspondencia_origen::text AS origen,r.id_correspondencia_relacionada::text AS relacionada,r.tipo_relacion AS tipo,r.id_movimiento::text AS "movimientoId",c.asunto FROM relacion_correspondencia r JOIN correspondencia c ON c.id_correspondencia=CASE WHEN r.id_correspondencia_origen=$1 THEN r.id_correspondencia_relacionada ELSE r.id_correspondencia_origen END AND c.id_direccion=r.id_direccion WHERE r.id_direccion=$2 AND (r.id_correspondencia_origen=$1 OR r.id_correspondencia_relacionada=$1)`,[id,d]) as Promise<unknown[]>;}
  // Para insertar A -> B, buscar primero un camino existente B -> A en la misma Dirección.
  async ciclo(q:QueryRunner,d:string,origen:string,destino:string){
    const r=await q.query(`WITH RECURSIVE camino(id) AS (
      SELECT $2::bigint
      UNION
      SELECT r.id_correspondencia_relacionada FROM relacion_correspondencia r JOIN camino c ON r.id_correspondencia_origen=c.id WHERE r.id_direccion=$1
    ) SELECT 1 FROM camino WHERE id=$3`,[d,origen,destino]) as unknown[];
    return r.length>0;
  }
  async evidencias(id:string,d:string,restringidos:boolean){return this.db.query(`SELECT x.id_movimiento_documento::text AS id,x.id_movimiento::text AS "movimientoId",x.id_documento::text AS "documentoId",x.numero_version_fijada AS "numeroVersion",a.titulo,v.nombre_original AS "nombreOriginal",v.tipo_mime AS "tipoMime",x.fecha_vinculacion AS "fechaVinculacion",x.fecha_desvinculacion AS "fechaRetiro",x.motivo_desvinculacion AS "motivoRetiro" FROM movimiento_documento x JOIN movimiento_correspondencia m USING(id_movimiento,id_direccion) JOIN documento a USING(id_documento,id_direccion) JOIN version_documento v ON v.id_documento=a.id_documento AND v.numero_version=x.numero_version_fijada WHERE m.id_correspondencia=$1 AND x.id_direccion=$2 AND ($3::boolean OR NOT EXISTS(SELECT 1 FROM restriccion_documento r WHERE r.id_documento=a.id_documento AND r.fecha_revocacion IS NULL)) ORDER BY x.id_movimiento_documento`,[id,d,restringidos]) as Promise<unknown[]>;}
  async protegido(id:string,d:string,q?:QueryRunner){const [r]=await (q??this.db).query(`SELECT (EXISTS(SELECT 1 FROM movimiento_correspondencia WHERE id_correspondencia=$1 AND id_direccion=$2) OR EXISTS(SELECT 1 FROM relacion_correspondencia WHERE id_direccion=$2 AND (id_correspondencia_origen=$1 OR id_correspondencia_relacionada=$1))) AS protegido`,[id,d]) as Array<{protegido:boolean}>;return r.protegido;}
}
