import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export interface ExpedienteFila {
  id:string; direccionId:string; periodoId:string; codigo:string|null; asunto:string; descripcion:string;
  versionControl:number; gestion:number; codigoPeriodo:string;
}
const CAMPOS=`e.id_expediente::text AS id,e.id_direccion::text AS "direccionId",e.id_periodo::text AS "periodoId",
  e.codigo,e.asunto,e.descripcion,e.version_control AS "versionControl",p.gestion,p.codigo_periodo AS "codigoPeriodo"`;
@Injectable()
export class ExpedientesRepository {
  constructor(private readonly db:DataSource){}
  async periodos(direccion:string) {
    return this.db.query(`SELECT id_periodo::text AS id,gestion,codigo_periodo AS codigo,fecha_inicio::text AS "fechaInicio",fecha_fin::text AS "fechaFin"
      FROM periodo_academico WHERE id_direccion=$1 ORDER BY gestion DESC,fecha_inicio DESC,id_periodo DESC`,[direccion]) as Promise<unknown[]>;
  }
  async listar(direccion:string,busqueda:string,periodo:string|null,pagina:number) {
    return this.db.query(`SELECT ${CAMPOS} FROM expediente e JOIN periodo_academico p USING(id_periodo,id_direccion)
      WHERE e.id_direccion=$1 AND ($2::bigint IS NULL OR e.id_periodo=$2)
      AND (e.asunto ILIKE $3 ESCAPE '\\' OR e.codigo ILIKE $3 ESCAPE '\\' OR ('EXP-'||lpad(e.id_expediente::text,greatest(6,length(e.id_expediente::text)),'0')) ILIKE $3 ESCAPE '\\')
      ORDER BY e.fecha_creacion DESC,e.id_expediente DESC LIMIT 21 OFFSET $4`,[direccion,periodo,`%${busqueda.replace(/[\\%_]/g,'\\$&')}%`,pagina*20]) as Promise<ExpedienteFila[]>;
  }
  async expediente(id:string,direccion:string,q?:QueryRunner,lock=false):Promise<ExpedienteFila|null> {
    const filas=await (q??this.db).query(`SELECT ${CAMPOS} FROM expediente e JOIN periodo_academico p USING(id_periodo,id_direccion)
      WHERE e.id_expediente=$1 AND e.id_direccion=$2 ${lock?'FOR UPDATE OF e':''}`,[id,direccion]) as ExpedienteFila[];
    return filas[0]??null;
  }
  async vinculos(id:string,direccion:string,restringidos:boolean) {
    return this.db.query(`SELECT x.id_expediente_documento::text AS id,x.id_documento::text AS "documentoId",d.titulo,
      x.numero_version_fijada AS "versionFijada",v.numero_version AS "numeroVersion",v.nombre_original AS "nombreOriginal",v.tipo_mime AS "tipoMime",
      x.es_obligatorio AS obligatorio,x.observacion,x.fecha_vinculacion AS "fechaVinculacion",x.fecha_desvinculacion AS "fechaRetiro",x.motivo_desvinculacion AS "motivoRetiro"
      FROM expediente_documento x JOIN documento d USING(id_documento,id_direccion)
      JOIN version_documento v ON v.id_documento=d.id_documento AND v.numero_version=COALESCE(x.numero_version_retiro,x.numero_version_fijada,d.version_actual)
      WHERE x.id_expediente=$1 AND x.id_direccion=$2 AND ($3::boolean OR NOT EXISTS(
        SELECT 1 FROM restriccion_documento r WHERE r.id_documento=d.id_documento AND r.fecha_revocacion IS NULL))
      ORDER BY x.fecha_vinculacion DESC,x.id_expediente_documento DESC`,[id,direccion,restringidos]) as Promise<unknown[]>;
  }
  async vinculo(q:QueryRunner,id:string,expediente:string,direccion:string) {
    const filas=await q.query(`SELECT id_documento::text AS "documentoId",es_obligatorio AS obligatorio,numero_version_fijada AS "versionFijada",fecha_desvinculacion AS retiro
      FROM expediente_documento WHERE id_expediente_documento=$1 AND id_expediente=$2 AND id_direccion=$3 FOR UPDATE`,[id,expediente,direccion]) as Array<{documentoId:string;obligatorio:boolean;versionFijada:number|null;retiro:Date|null}>;
    return filas[0]??null;
  }
}
