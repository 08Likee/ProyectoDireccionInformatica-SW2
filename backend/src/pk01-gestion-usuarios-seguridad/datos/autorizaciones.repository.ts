import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

/** Identificadores BIGINT tratados siempre como cadenas. */
export interface DirectorContexto {
  id_usuario: string;
  id_direccion: string;
  codigo_direccion: string;
  nombre_direccion: string;
}
export interface RolFila {
  id_rol: string;
  id_direccion: string;
  nombre: string;
  descripcion: string;
  estado: string;
  es_sistema: boolean;
  version_control: number;
  permisos: string[];
}
export interface AsignacionFila {
  id: string;
  tipo: 'ROL' | 'PERMISO';
  usuario_id: string;
  destinatario: string;
  referencia_id: string;
  referencia: string;
  fecha_inicio: Date;
  fecha_fin: Date | null;
  fecha_revocacion: Date | null;
}

/** SQL de permisos efectivos: los intervalos y el estado del rol se calculan en cada solicitud. */
const PERMISOS_ACTIVOS = `
  SELECT p.codigo FROM asignacion_rol ar
    JOIN rol r ON r.id_rol=ar.id_rol AND r.estado='ACTIVO'
    JOIN rol_permiso rp ON rp.id_rol=r.id_rol
    JOIN permiso p ON p.id_permiso=rp.id_permiso
  WHERE ar.id_usuario=$1 AND r.id_direccion=$2
    AND ar.fecha_inicio<=now() AND (ar.fecha_fin IS NULL OR ar.fecha_fin>now())
    AND ar.fecha_revocacion IS NULL
  UNION
  SELECT p.codigo FROM asignacion_permiso ap
    JOIN permiso p ON p.id_permiso=ap.id_permiso
  WHERE ap.id_usuario=$1 AND ap.id_direccion=$2
    AND ap.fecha_inicio<=now() AND (ap.fecha_fin IS NULL OR ap.fecha_fin>now())
    AND ap.fecha_revocacion IS NULL`;

@Injectable()
export class AutorizacionesRepository {
  constructor(private readonly db: DataSource) {}

  async enTransaccion<T>(fn: (q: QueryRunner) => Promise<T>): Promise<T> {
    const q = this.db.createQueryRunner();
    await q.connect();
    await q.startTransaction();
    try {
      const valor = await fn(q);
      await q.commitTransaction();
      return valor;
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    } finally { await q.release(); }
  }

  async directorAutorizado(hashSesion: string, q?: QueryRunner): Promise<DirectorContexto | null> {
    const filas = (await (q ?? this.db).query(`
      SELECT a.id_usuario::text, a.id_direccion::text, d.codigo AS codigo_direccion,
        d.nombre AS nombre_direccion
      FROM sesion s
      JOIN usuario u ON u.id_usuario=s.id_usuario AND u.estado_cuenta='ACTIVA' AND u.fecha_verificacion IS NOT NULL
      JOIN autoridad_direccion a ON a.id_usuario=u.id_usuario
        AND a.fecha_inicio<=now() AND (a.fecha_fin IS NULL OR a.fecha_fin>now())
      JOIN direccion_institucional d ON d.id_direccion=a.id_direccion
      WHERE s.identificador_seguro=$1 AND s.fecha_invalidacion IS NULL AND s.fecha_expiracion>now()
        AND EXISTS (SELECT 1 FROM (${PERMISOS_ACTIVOS.replaceAll('$1', 'u.id_usuario').replaceAll('$2', 'a.id_direccion')}) pa
          WHERE pa.codigo='AUTORIZACIONES_ADMINISTRAR')
      LIMIT 1 ${q ? 'FOR UPDATE OF a,s' : ''}
    `, [hashSesion])) as DirectorContexto[];
    return filas[0] ?? null;
  }

  async usuarioDeSesion(hashSesion: string): Promise<string | null> {
    const filas = (await this.db.query(`SELECT u.id_usuario::text AS id FROM sesion s
      JOIN usuario u ON u.id_usuario=s.id_usuario
      WHERE s.identificador_seguro=$1 AND s.fecha_invalidacion IS NULL AND s.fecha_expiracion>now()
        AND u.estado_cuenta='ACTIVA' AND u.fecha_verificacion IS NOT NULL`, [hashSesion])) as Array<{ id: string }>;
    return filas[0]?.id ?? null;
  }

  /** Intentos administrativos rechazados: registro independiente del rollback de la acción. */
  async registrarRechazo(hashSesion: string, accion: string): Promise<void> {
    const usuario = await this.usuarioDeSesion(hashSesion);
    if (!usuario) return;
    const direcciones = (await this.db.query(`SELECT id_direccion::text AS id
      FROM autoridad_direccion WHERE id_usuario=$1 AND fecha_inicio<=now()
        AND (fecha_fin IS NULL OR fecha_fin>now()) LIMIT 1`, [usuario])) as Array<{id:string}>;
    await this.db.query(`INSERT INTO registro_auditoria(tipo_actor,accion,tipo_entidad,
      origen,resultado,identificador_correlacion,id_usuario,id_direccion)
      VALUES('HUMANO',$1,'AUTORIZACIONES','APLICACION','DENEGADO',$2,$3,$4)`,
    [accion, randomUUID(), usuario, direcciones[0]?.id ?? null]);
  }

  async permisosEfectivos(idUsuario: string, idDireccion: string, q?: QueryRunner): Promise<string[]> {
    const filas = (await (q ?? this.db).query(`SELECT DISTINCT codigo FROM (${PERMISOS_ACTIVOS}) t ORDER BY codigo`,
      [idUsuario, idDireccion])) as Array<{ codigo: string }>;
    return filas.map(f => f.codigo);
  }

  async permisosDeUsuario(idUsuario: string): Promise<string[]> {
    const filas = (await this.db.query(`
      SELECT DISTINCT t.codigo FROM (
        SELECT p.codigo FROM asignacion_rol ar
        JOIN rol r ON r.id_rol=ar.id_rol AND r.estado='ACTIVO'
        JOIN rol_permiso rp ON rp.id_rol=r.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso
        WHERE ar.id_usuario=$1 AND ar.fecha_inicio<=now()
          AND (ar.fecha_fin IS NULL OR ar.fecha_fin>now()) AND ar.fecha_revocacion IS NULL
        UNION
        SELECT p.codigo FROM asignacion_permiso ap JOIN permiso p ON p.id_permiso=ap.id_permiso
        WHERE ap.id_usuario=$1 AND ap.fecha_inicio<=now()
          AND (ap.fecha_fin IS NULL OR ap.fecha_fin>now()) AND ap.fecha_revocacion IS NULL
      ) t ORDER BY t.codigo`, [idUsuario])) as Array<{ codigo: string }>;
    return filas.map(f => f.codigo);
  }

  async permisosCatalogo(): Promise<Array<{ id: string; codigo: string; modulo: string; operacion: string; descripcion: string }>> {
    return (await this.db.query(`SELECT id_permiso::text AS id,codigo,modulo,operacion,descripcion
      FROM permiso ORDER BY modulo,operacion`)) as Array<{ id: string; codigo: string; modulo: string; operacion: string; descripcion: string }>;
  }

  async roles(idDireccion: string): Promise<RolFila[]> {
    return (await this.db.query(`SELECT r.id_rol::text,r.id_direccion::text,r.nombre,r.descripcion,r.estado,
      r.es_sistema,r.version_control,
      COALESCE(array_agg(p.codigo ORDER BY p.codigo) FILTER (WHERE p.codigo IS NOT NULL), ARRAY[]::text[]) AS permisos
      FROM rol r LEFT JOIN rol_permiso rp ON rp.id_rol=r.id_rol
      LEFT JOIN permiso p ON p.id_permiso=rp.id_permiso
      WHERE r.id_direccion=$1 GROUP BY r.id_rol ORDER BY r.es_sistema DESC,r.nombre`,
    [idDireccion])) as RolFila[];
  }

  async usuariosVerificados(busqueda: string, limite: number): Promise<Array<{
    id: string; correo: string; nombres: string; apellidos: string; identificadorPersonal: string
  }>> {
    return (await this.db.query(`SELECT id_usuario::text AS id,correo,nombres,apellidos,
      identificador_personal AS "identificadorPersonal" FROM usuario
      WHERE estado_cuenta='ACTIVA' AND (
        correo ILIKE $1 ESCAPE '\\' OR nombres ILIKE $1 ESCAPE '\\' OR apellidos ILIKE $1 ESCAPE '\\'
        OR identificador_personal ILIKE $1 ESCAPE '\\')
      ORDER BY apellidos,nombres,id_usuario LIMIT $2`, [busqueda, limite])) as Array<{
      id: string; correo: string; nombres: string; apellidos: string; identificadorPersonal: string
    }>;
  }

  async asignaciones(idDireccion: string, usuarioId?: string): Promise<AsignacionFila[]> {
    return (await this.db.query(`
      SELECT ar.id_asignacion_rol::text AS id,'ROL' AS tipo,ar.id_usuario::text AS usuario_id,
        concat(u.nombres,' ',u.apellidos) AS destinatario,ar.id_rol::text AS referencia_id,
        r.nombre AS referencia,ar.fecha_inicio,ar.fecha_fin,ar.fecha_revocacion
      FROM asignacion_rol ar JOIN rol r ON r.id_rol=ar.id_rol
        JOIN usuario u ON u.id_usuario=ar.id_usuario
      WHERE r.id_direccion=$1 AND ($2::bigint IS NULL OR ar.id_usuario=$2)
      UNION ALL
      SELECT ap.id_asignacion_permiso::text,'PERMISO',ap.id_usuario::text,
        concat(u.nombres,' ',u.apellidos),ap.id_permiso::text,p.codigo,
        ap.fecha_inicio,ap.fecha_fin,ap.fecha_revocacion
      FROM asignacion_permiso ap JOIN permiso p ON p.id_permiso=ap.id_permiso
        JOIN usuario u ON u.id_usuario=ap.id_usuario
      WHERE ap.id_direccion=$1 AND ($2::bigint IS NULL OR ap.id_usuario=$2)
      ORDER BY fecha_inicio DESC LIMIT 150`, [idDireccion, usuarioId ?? null])) as AsignacionFila[];
  }
}
