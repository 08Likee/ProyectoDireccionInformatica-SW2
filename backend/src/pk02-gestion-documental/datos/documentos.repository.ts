import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export interface DireccionDocumento { id: string; codigo: string; nombre: string }
export interface DocumentoFila {
  id: string; direccionId: string; codigo: string; titulo: string; categoria: string; descripcion: string;
  versionActual: number; versionControl: number; fechaCreacion: Date; fechaActualizacion: Date;
  nombreArchivo: string; tipoMime: string; tamano: string;
}
export interface VersionFila {
  id: string; numeroVersion: number; nombreOriginal: string; tipoMime: string;
  tamanoBytes: string; sha256: string; claveArchivo: string; fechaCreacion: Date;
}

/** Repositorio de metadatos; el almacenamiento de bytes reside en otro adaptador privado. */
@Injectable()
export class DocumentosRepository {
  constructor(private readonly db: DataSource) {}

  async sesion(hash: string): Promise<string | null> {
    const filas = (await this.db.query(`SELECT u.id_usuario::text AS id FROM sesion s
      JOIN usuario u ON u.id_usuario=s.id_usuario AND u.estado_cuenta='ACTIVA'
      AND u.fecha_verificacion IS NOT NULL WHERE s.identificador_seguro=$1
      AND s.fecha_invalidacion IS NULL AND s.fecha_expiracion>now()`, [hash])) as Array<{id:string}>;
    return filas[0]?.id ?? null;
  }

  async ambitos(usuarioId: string, permiso: string): Promise<DireccionDocumento[]> {
    // No confiar en ámbito enviado por el navegador; se deriva de asignaciones vigentes.
    return await this.db.query(`SELECT DISTINCT d.id_direccion::text AS id,d.codigo,d.nombre
      FROM direccion_institucional d JOIN (
        SELECT r.id_direccion FROM asignacion_rol ar JOIN rol r ON r.id_rol=ar.id_rol AND r.estado='ACTIVO'
          JOIN rol_permiso rp ON rp.id_rol=r.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso
          WHERE ar.id_usuario=$1 AND p.codigo=$2 AND ar.fecha_revocacion IS NULL
            AND ar.fecha_inicio<=now() AND (ar.fecha_fin IS NULL OR ar.fecha_fin>now())
        UNION
        SELECT ap.id_direccion FROM asignacion_permiso ap JOIN permiso p ON p.id_permiso=ap.id_permiso
          WHERE ap.id_usuario=$1 AND p.codigo=$2 AND ap.fecha_revocacion IS NULL
            AND ap.fecha_inicio<=now() AND (ap.fecha_fin IS NULL OR ap.fecha_fin>now())
      ) autorizado ON autorizado.id_direccion=d.id_direccion ORDER BY d.nombre,id`, [usuarioId,permiso]) as DireccionDocumento[];
  }

  async transaccion<T>(fn: (q: QueryRunner) => Promise<T>): Promise<T> {
    const q = this.db.createQueryRunner(); await q.connect(); await q.startTransaction();
    try { const resultado = await fn(q); await q.commitTransaction(); return resultado; }
    catch (e) { await q.rollbackTransaction(); throw e; }
    finally { await q.release(); }
  }

  async listar(idDireccion: string, busqueda: string, pagina: number): Promise<DocumentoFila[]> {
    return await this.db.query(`SELECT d.id_documento::text AS id,d.id_direccion::text AS "direccionId",
      d.codigo::text,d.titulo,d.categoria,d.descripcion,d.version_actual AS "versionActual",
      d.version_control AS "versionControl",d.fecha_creacion AS "fechaCreacion",
      d.fecha_actualizacion AS "fechaActualizacion",v.nombre_original AS "nombreArchivo",
      v.tipo_mime AS "tipoMime",v.tamano_bytes::text AS tamano
      FROM documento d JOIN version_documento v ON v.id_documento=d.id_documento AND v.numero_version=d.version_actual
      WHERE d.id_direccion=$1 AND ($2::text='' OR d.titulo ILIKE $3 ESCAPE '\\' OR d.categoria ILIKE $3 ESCAPE '\\')
      ORDER BY d.fecha_creacion DESC,d.id_documento DESC LIMIT 21 OFFSET $4`,
    [idDireccion,busqueda,`%${busqueda.replace(/[\\%_]/g,'\\$&')}%`,pagina*20]) as DocumentoFila[];
  }

  async documento(id: string, idDireccion: string, q?: QueryRunner, bloquear = false): Promise<DocumentoFila | null> {
    const filas = await (q ?? this.db).query(`SELECT d.id_documento::text AS id,d.id_direccion::text AS "direccionId",
      d.codigo::text,d.titulo,d.categoria,d.descripcion,d.version_actual AS "versionActual",
      d.version_control AS "versionControl",d.fecha_creacion AS "fechaCreacion",
      d.fecha_actualizacion AS "fechaActualizacion",v.nombre_original AS "nombreArchivo",
      v.tipo_mime AS "tipoMime",v.tamano_bytes::text AS tamano
      FROM documento d JOIN version_documento v ON v.id_documento=d.id_documento AND v.numero_version=d.version_actual
      WHERE d.id_documento=$1 AND d.id_direccion=$2 ${bloquear ? 'FOR UPDATE OF d' : ''}`, [id,idDireccion]) as DocumentoFila[];
    return filas[0] ?? null;
  }

  async archivoRegistrado(clave: string): Promise<boolean> {
    const filas = await this.db.query('SELECT 1 FROM version_documento WHERE clave_archivo=$1 LIMIT 1',[clave]) as unknown[];
    return filas.length > 0;
  }

  async versiones(id: string): Promise<VersionFila[]> {
    return await this.db.query(`SELECT id_version::text AS id,numero_version AS "numeroVersion",
      nombre_original AS "nombreOriginal",tipo_mime AS "tipoMime",tamano_bytes::text AS "tamanoBytes",
      sha256,clave_archivo::text AS "claveArchivo",fecha_creacion AS "fechaCreacion"
      FROM version_documento WHERE id_documento=$1 ORDER BY numero_version DESC`,[id]) as VersionFila[];
  }

  async version(id: string, numero: number): Promise<VersionFila | null> {
    const filas = await this.db.query(`SELECT id_version::text AS id,numero_version AS "numeroVersion",
      nombre_original AS "nombreOriginal",tipo_mime AS "tipoMime",tamano_bytes::text AS "tamanoBytes",
      sha256,clave_archivo::text AS "claveArchivo",fecha_creacion AS "fechaCreacion"
      FROM version_documento WHERE id_documento=$1 AND numero_version=$2`,[id,numero]) as VersionFila[];
    return filas[0] ?? null;
  }
}
