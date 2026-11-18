import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-02: autorizaciones por dirección y auditoría transaccional, sin privilegios por autorregistro. */
export class CrearAutorizaciones1794960001000 implements MigrationInterface {
  name = 'CrearAutorizaciones1794960001000';

  public async up(q: QueryRunner): Promise<void> {
    // Se necesita btree_gist para impedir vigencias superpuestas, incluso ante solicitudes concurrentes.
    await q.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await q.query(`CREATE TABLE direccion_institucional (
      id_direccion BIGSERIAL PRIMARY KEY,
      codigo VARCHAR(30) NOT NULL UNIQUE,
      nombre VARCHAR(150) NOT NULL,
      CONSTRAINT direccion_codigo_no_vacio CHECK (length(btrim(codigo))>0),
      CONSTRAINT direccion_nombre_no_vacio CHECK (length(btrim(nombre))>0)
    )`);
    await q.query(`CREATE TABLE permiso (
      id_permiso BIGSERIAL PRIMARY KEY,
      codigo VARCHAR(60) NOT NULL UNIQUE,
      modulo VARCHAR(60) NOT NULL,
      operacion VARCHAR(100) NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      CONSTRAINT permiso_codigo_no_vacio CHECK (length(btrim(codigo))>0)
    )`);
    await q.query(`CREATE TABLE rol (
      id_rol BIGSERIAL PRIMARY KEY,
      id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion) ON DELETE RESTRICT,
      nombre VARCHAR(100) NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      estado VARCHAR(15) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
      es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
      version_control INTEGER NOT NULL DEFAULT 0 CHECK (version_control >= 0),
      fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
      creado_por BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      actualizado_por BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      CONSTRAINT rol_nombre_no_vacio CHECK (length(btrim(nombre))>0)
    )`);
    await q.query('CREATE UNIQUE INDEX rol_nombre_direccion ON rol(id_direccion, lower(nombre))');
    await q.query(`CREATE TABLE rol_permiso (
      id_rol BIGINT NOT NULL REFERENCES rol(id_rol) ON DELETE RESTRICT,
      id_permiso BIGINT NOT NULL REFERENCES permiso(id_permiso) ON DELETE RESTRICT,
      PRIMARY KEY(id_rol, id_permiso)
    )`);
    await q.query(`CREATE TABLE asignacion_rol (
      id_asignacion_rol BIGSERIAL PRIMARY KEY,
      id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      id_rol BIGINT NOT NULL REFERENCES rol(id_rol) ON DELETE RESTRICT,
      asignado_por BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT now(),
      fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
      fecha_fin TIMESTAMPTZ,
      fecha_revocacion TIMESTAMPTZ,
      revocado_por BIGINT REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      motivo_revocacion TEXT,
      CONSTRAINT asignacion_rol_intervalo CHECK (fecha_fin IS NULL OR fecha_fin>fecha_inicio),
      CONSTRAINT asignacion_rol_revocacion CHECK (
        (fecha_revocacion IS NULL AND revocado_por IS NULL)
        OR (fecha_revocacion IS NOT NULL AND revocado_por IS NOT NULL AND fecha_revocacion>=fecha_inicio)
      ),
      CONSTRAINT asignacion_rol_vigencias EXCLUDE USING gist (
        id_usuario WITH =, id_rol WITH =,
        tstzrange(fecha_inicio,LEAST(COALESCE(fecha_fin,'infinity'::timestamptz),
          COALESCE(fecha_revocacion,'infinity'::timestamptz)),'[)') WITH &&
      )
    )`);
    await q.query(`CREATE TABLE asignacion_permiso (
      id_asignacion_permiso BIGSERIAL PRIMARY KEY,
      id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      id_permiso BIGINT NOT NULL REFERENCES permiso(id_permiso) ON DELETE RESTRICT,
      id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion) ON DELETE RESTRICT,
      asignado_por BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT now(),
      fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
      fecha_fin TIMESTAMPTZ,
      fecha_revocacion TIMESTAMPTZ,
      revocado_por BIGINT REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      motivo_revocacion TEXT,
      CONSTRAINT asignacion_permiso_intervalo CHECK (fecha_fin IS NULL OR fecha_fin>fecha_inicio),
      CONSTRAINT asignacion_permiso_revocacion CHECK (
        (fecha_revocacion IS NULL AND revocado_por IS NULL)
        OR (fecha_revocacion IS NOT NULL AND revocado_por IS NOT NULL AND fecha_revocacion>=fecha_inicio)
      ),
      CONSTRAINT asignacion_permiso_vigencias EXCLUDE USING gist (
        id_usuario WITH =, id_permiso WITH =, id_direccion WITH =,
        tstzrange(fecha_inicio,LEAST(COALESCE(fecha_fin,'infinity'::timestamptz),
          COALESCE(fecha_revocacion,'infinity'::timestamptz)),'[)') WITH &&
      )
    )`);
    await q.query(`CREATE TABLE autoridad_direccion (
      id_autoridad BIGSERIAL PRIMARY KEY,
      id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion) ON DELETE RESTRICT,
      id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
      fecha_fin TIMESTAMPTZ,
      CONSTRAINT autoridad_intervalo CHECK (fecha_fin IS NULL OR fecha_fin>fecha_inicio),
      CONSTRAINT autoridad_sin_solapamiento EXCLUDE USING gist (
        id_direccion WITH =,
        tstzrange(fecha_inicio,COALESCE(fecha_fin,'infinity'::timestamptz),'[)') WITH &&
      )
    )`);
    await q.query(`CREATE TABLE registro_auditoria (
      id_auditoria BIGSERIAL PRIMARY KEY,
      tipo_actor VARCHAR(15) NOT NULL CHECK (tipo_actor IN ('HUMANO','TECNICO')),
      identidad_tecnica VARCHAR(100),
      accion VARCHAR(100) NOT NULL,
      tipo_entidad VARCHAR(60) NOT NULL,
      identificador_entidad TEXT,
      fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
      origen VARCHAR(40) NOT NULL,
      datos_anteriores JSONB,
      datos_posteriores JSONB,
      resultado VARCHAR(15) NOT NULL DEFAULT 'EXITO',
      identificador_correlacion UUID NOT NULL,
      id_direccion BIGINT REFERENCES direccion_institucional(id_direccion) ON DELETE RESTRICT,
      id_usuario BIGINT REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      CONSTRAINT auditoria_actor_consistente CHECK (
        (tipo_actor='HUMANO' AND id_usuario IS NOT NULL AND identidad_tecnica IS NULL)
        OR (tipo_actor='TECNICO' AND id_usuario IS NULL AND identidad_tecnica IS NOT NULL)
      )
    )`);
    await q.query('CREATE INDEX auditoria_direccion_fecha ON registro_auditoria(id_direccion, fecha_hora DESC)');
    await q.query('CREATE INDEX asignacion_rol_usuario ON asignacion_rol(id_usuario)');
    await q.query('CREATE INDEX asignacion_permiso_usuario_direccion ON asignacion_permiso(id_usuario,id_direccion)');
    const catalogo: Array<[string,string,string,string]> = [
      ['AUTORIZACIONES_ADMINISTRAR','Seguridad','Administrar autorizaciones','Administrar roles y permisos de la Dirección'],
      ['AUDITORIA_CONSULTAR','Seguridad','Consultar auditoría','Consultar eventos auditables autorizados'],
      ['CORRESPONDENCIA_GESTIONAR','Correspondencia','Gestionar correspondencia','Registrar y actualizar correspondencia'],
      ['CORRESPONDENCIA_CONSULTAR','Correspondencia','Consultar correspondencia','Consultar correspondencia autorizada'],
      ['SEGUIMIENTO_GESTIONAR','Correspondencia','Gestionar seguimiento','Registrar actuaciones de seguimiento'],
      ['SEGUIMIENTO_CONSULTAR','Correspondencia','Consultar seguimiento','Consultar seguimiento autorizado'],
      ['DOCUMENTOS_GESTIONAR','Documentos','Gestionar documentos','Incorporar y modificar documentos'],
      ['DOCUMENTOS_CONSULTAR','Documentos','Consultar documentos','Consultar y descargar documentos autorizados'],
      ['EXPEDIENTES_GESTIONAR','Expedientes','Gestionar expedientes','Crear y actualizar expedientes'],
      ['EXPEDIENTES_CONSULTAR','Expedientes','Consultar expedientes','Consultar expedientes autorizados'],
      ['FILTROS_CONSULTAR','Consultas','Consultar registros','Consultar registros con filtros autorizados'],
    ];
    for (const [codigo,modulo,operacion,descripcion] of catalogo) {
      await q.query('INSERT INTO permiso(codigo,modulo,operacion,descripcion) VALUES($1,$2,$3,$4)',
        [codigo,modulo,operacion,descripcion]);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const tabla of ['registro_auditoria','autoridad_direccion','asignacion_permiso','asignacion_rol',
      'rol_permiso','rol','permiso','direccion_institucional']) {
      await q.query(`DROP TABLE ${tabla}`);
    }
    // No eliminar btree_gist: podría ser utilizada por otras tablas del servidor.
  }
}
