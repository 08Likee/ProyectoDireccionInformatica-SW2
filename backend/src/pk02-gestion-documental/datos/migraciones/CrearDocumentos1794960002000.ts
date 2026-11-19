import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-07. El archivo físico reside fuera del directorio público y del código fuente. */
export class CrearDocumentos1794960002000 implements MigrationInterface {
  name = 'CrearDocumentos1794960002000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE documento (
      id_documento BIGSERIAL PRIMARY KEY,
      id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion) ON DELETE RESTRICT,
      codigo UUID NOT NULL UNIQUE,
      titulo VARCHAR(160) NOT NULL CHECK (length(btrim(titulo)) >= 2),
      categoria VARCHAR(80) NOT NULL CHECK (length(btrim(categoria)) >= 2),
      descripcion VARCHAR(1000) NOT NULL DEFAULT '',
      version_actual INTEGER NOT NULL DEFAULT 1 CHECK (version_actual >= 1),
      version_control INTEGER NOT NULL DEFAULT 0 CHECK (version_control >= 0),
      creado_por BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      actualizado_por BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
      fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query('CREATE INDEX documento_direccion_fecha ON documento(id_direccion,fecha_creacion DESC,id_documento DESC)');
    await q.query(`CREATE TABLE version_documento (
      id_version BIGSERIAL PRIMARY KEY,
      id_documento BIGINT NOT NULL REFERENCES documento(id_documento) ON DELETE RESTRICT,
      numero_version INTEGER NOT NULL CHECK (numero_version >= 1),
      clave_archivo UUID NOT NULL UNIQUE,
      nombre_original VARCHAR(200) NOT NULL CHECK (length(btrim(nombre_original)) > 0),
      tipo_mime VARCHAR(100) NOT NULL CHECK (tipo_mime IN (
        'application/pdf','image/jpeg','image/png','text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
      tamano_bytes BIGINT NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760),
      sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
      cargado_por BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(id_documento,numero_version)
    )`);
    await q.query('CREATE INDEX version_documento_numero ON version_documento(id_documento,numero_version DESC)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE version_documento');
    await q.query('DROP TABLE documento');
  }
}
