import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface AmbitoAuditoria { id: string; codigo: string; nombre: string }
export interface FiltrosAuditoria {
  desde?: string;
  hastaExclusiva?: string;
  accion?: string;
  actor?: string;
  entidad?: string;
  resultado?: 'EXITO' | 'DENEGADO';
}
export interface EventoAuditoria {
  id: string;
  fechaHora: Date;
  accion: string;
  entidad: string;
  identificadorEntidad: string | null;
  actor: string;
  tipoActor: string;
  resultado: string;
  origen: string;
}
export interface DetalleAuditoria extends EventoAuditoria {
  datosAnteriores: unknown;
  datosPosteriores: unknown;
  identificadorCorrelacion: string;
}

/** CU-03. Lecturas acotadas por ámbito, sin escrituras sobre registro_auditoria. */
@Injectable()
export class AuditoriaRepository {
  constructor(private readonly db: DataSource) {}

  async ambitosConPermiso(idUsuario: string): Promise<AmbitoAuditoria[]> {
    return (await this.db.query(`
      SELECT DISTINCT d.id_direccion::text AS id,d.codigo,d.nombre
      FROM direccion_institucional d JOIN (
        SELECT r.id_direccion FROM asignacion_rol ar
        JOIN rol r ON r.id_rol=ar.id_rol AND r.estado='ACTIVO'
        JOIN rol_permiso rp ON rp.id_rol=r.id_rol
        JOIN permiso p ON p.id_permiso=rp.id_permiso
        WHERE ar.id_usuario=$1 AND p.codigo='AUDITORIA_CONSULTAR'
          AND ar.fecha_inicio<=now() AND (ar.fecha_fin IS NULL OR ar.fecha_fin>now())
          AND ar.fecha_revocacion IS NULL
        UNION
        SELECT ap.id_direccion FROM asignacion_permiso ap
        JOIN permiso p ON p.id_permiso=ap.id_permiso
        WHERE ap.id_usuario=$1 AND p.codigo='AUDITORIA_CONSULTAR'
          AND ap.fecha_inicio<=now() AND (ap.fecha_fin IS NULL OR ap.fecha_fin>now())
          AND ap.fecha_revocacion IS NULL
      ) autorizada ON autorizada.id_direccion=d.id_direccion
      ORDER BY d.nombre,id`, [idUsuario])) as AmbitoAuditoria[];
  }

  async listar(idDireccion: string, filtros: FiltrosAuditoria, pagina: number, limite: number): Promise<EventoAuditoria[]> {
    const parametros: unknown[] = [idDireccion];
    const condiciones = ['a.id_direccion=$1'];
    const agregar = (sql: (n: number) => string, valor: unknown) => {
      parametros.push(valor);
      condiciones.push(sql(parametros.length));
    };
    if (filtros.desde) agregar(n => `a.fecha_hora >= ($${n}::date::timestamp AT TIME ZONE 'America/La_Paz')`, filtros.desde);
    if (filtros.hastaExclusiva) agregar(n => `a.fecha_hora < ($${n}::date::timestamp AT TIME ZONE 'America/La_Paz')`, filtros.hastaExclusiva);
    if (filtros.accion) agregar(n => `a.accion ILIKE $${n} ESCAPE '\\'`, `%${escaparLike(filtros.accion)}%`);
    if (filtros.actor) agregar(n => `(COALESCE(u.nombres || ' ' || u.apellidos,'') ILIKE $${n} ESCAPE '\\'
      OR COALESCE(a.identidad_tecnica,'') ILIKE $${n} ESCAPE '\\')`, `%${escaparLike(filtros.actor)}%`);
    if (filtros.entidad) agregar(n => `a.tipo_entidad ILIKE $${n} ESCAPE '\\'`, `%${escaparLike(filtros.entidad)}%`);
    if (filtros.resultado) agregar(n => `a.resultado=$${n}`, filtros.resultado);
    parametros.push(limite + 1, pagina * limite);
    const tope = parametros.length - 1;
    const desplazamiento = parametros.length;
    return (await this.db.query(`
      SELECT a.id_auditoria::text AS id,a.fecha_hora AS "fechaHora",a.accion,
        a.tipo_entidad AS entidad,a.identificador_entidad AS "identificadorEntidad",
        COALESCE(NULLIF(btrim(concat_ws(' ',u.nombres,u.apellidos)),''),a.identidad_tecnica,'Sistema') AS actor,
        a.tipo_actor AS "tipoActor",a.resultado,a.origen
      FROM registro_auditoria a LEFT JOIN usuario u ON u.id_usuario=a.id_usuario
      WHERE ${condiciones.join(' AND ')}
      ORDER BY a.fecha_hora DESC,a.id_auditoria DESC
      LIMIT $${tope} OFFSET $${desplazamiento}`, parametros)) as EventoAuditoria[];
  }

  async detalle(idDireccion: string, id: string): Promise<DetalleAuditoria | null> {
    const filas = (await this.db.query(`
      SELECT a.id_auditoria::text AS id,a.fecha_hora AS "fechaHora",a.accion,
        a.tipo_entidad AS entidad,a.identificador_entidad AS "identificadorEntidad",
        COALESCE(NULLIF(btrim(concat_ws(' ',u.nombres,u.apellidos)),''),a.identidad_tecnica,'Sistema') AS actor,
        a.tipo_actor AS "tipoActor",a.resultado,a.origen,
        a.datos_anteriores AS "datosAnteriores",a.datos_posteriores AS "datosPosteriores",
        a.identificador_correlacion::text AS "identificadorCorrelacion"
      FROM registro_auditoria a LEFT JOIN usuario u ON u.id_usuario=a.id_usuario
      WHERE a.id_auditoria=$2 AND a.id_direccion=$1 LIMIT 1`, [idDireccion,id])) as DetalleAuditoria[];
    return filas[0] ?? null;
  }
}

/** Los caracteres comodín no pueden modificar el criterio ingresado por el funcionario. */
function escaparLike(valor: string): string { return valor.replace(/[\\%_]/g, '\\$&'); }
