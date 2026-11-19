import { MigrationInterface, QueryRunner } from 'typeorm';

export class CrearSeguimientoCorrespondencia1794960006000 implements MigrationInterface {
  async up(q:QueryRunner):Promise<void>{
    await q.query(`CREATE TABLE tipo_movimiento_correspondencia (
      id_tipo_movimiento BIGSERIAL PRIMARY KEY, codigo VARCHAR(30) NOT NULL UNIQUE,
      nombre VARCHAR(150) NOT NULL CHECK(btrim(nombre)<>''),
      CHECK(codigo IN ('RECEPCION','ENVIO','DERIVACION','SEGUIMIENTO','RESPUESTA','REITERACION','ACLARACION')))`);
    await q.query(`INSERT INTO tipo_movimiento_correspondencia(codigo,nombre) VALUES
      ('RECEPCION','Recepción'),('ENVIO','Envío'),('DERIVACION','Derivación'),('SEGUIMIENTO','Seguimiento'),
      ('RESPUESTA','Respuesta'),('REITERACION','Reiteración'),('ACLARACION','Aclaración')`);
    await q.query(`CREATE TABLE movimiento_correspondencia (
      id_movimiento BIGSERIAL PRIMARY KEY, id_correspondencia BIGINT NOT NULL, id_direccion BIGINT NOT NULL,
      id_tipo_movimiento BIGINT NOT NULL REFERENCES tipo_movimiento_correspondencia(id_tipo_movimiento),
      fecha_actuacion TIMESTAMPTZ NOT NULL, fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
      orden_registro INTEGER NOT NULL CHECK(orden_registro>0), observacion VARCHAR(2000) NOT NULL DEFAULT '', referencia VARCHAR(255) NOT NULL DEFAULT '',
      estado_resultante VARCHAR(30) CHECK(estado_resultante IN ('RECEPCION','ENVIO','DERIVACION','RESPUESTA','REITERACION')), id_responsable BIGINT NOT NULL, nombre_responsable_registrado VARCHAR(255) NOT NULL CHECK(btrim(nombre_responsable_registrado)<>''),
      id_destino BIGINT, nombre_destino_registrado VARCHAR(255), registrado_por BIGINT NOT NULL REFERENCES usuario(id_usuario),
      id_movimiento_aclarado BIGINT,
      UNIQUE(id_movimiento,id_direccion), UNIQUE(id_movimiento,id_correspondencia,id_direccion), UNIQUE(id_correspondencia,orden_registro),
      FOREIGN KEY(id_correspondencia,id_direccion) REFERENCES correspondencia(id_correspondencia,id_direccion),
      FOREIGN KEY(id_responsable,id_direccion) REFERENCES interlocutor(id_interlocutor,id_direccion),
      FOREIGN KEY(id_destino,id_direccion) REFERENCES interlocutor(id_interlocutor,id_direccion),
      FOREIGN KEY(id_movimiento_aclarado,id_correspondencia,id_direccion) REFERENCES movimiento_correspondencia(id_movimiento,id_correspondencia,id_direccion),
      CHECK(id_movimiento_aclarado IS NULL OR id_movimiento_aclarado<>id_movimiento),
      CHECK((id_destino IS NULL AND nombre_destino_registrado IS NULL) OR (id_destino IS NOT NULL AND nombre_destino_registrado IS NOT NULL AND btrim(nombre_destino_registrado)<>'')),
      CHECK(fecha_actuacion<=fecha_registro))`);
    await q.query(`CREATE TABLE relacion_correspondencia (
      id_relacion BIGSERIAL PRIMARY KEY, id_direccion BIGINT NOT NULL, id_correspondencia_origen BIGINT NOT NULL,
      id_correspondencia_relacionada BIGINT NOT NULL, id_movimiento BIGINT NOT NULL UNIQUE,
      tipo_relacion VARCHAR(20) NOT NULL CHECK(tipo_relacion IN ('RESPUESTA','REITERACION')),
      fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(), registrado_por BIGINT NOT NULL REFERENCES usuario(id_usuario),
      CHECK(id_correspondencia_origen<>id_correspondencia_relacionada),
      UNIQUE(id_correspondencia_origen,id_correspondencia_relacionada),
      FOREIGN KEY(id_correspondencia_origen,id_direccion) REFERENCES correspondencia(id_correspondencia,id_direccion),
      FOREIGN KEY(id_correspondencia_relacionada,id_direccion) REFERENCES correspondencia(id_correspondencia,id_direccion),
      FOREIGN KEY(id_movimiento,id_correspondencia_origen,id_direccion) REFERENCES movimiento_correspondencia(id_movimiento,id_correspondencia,id_direccion))`);
    await q.query('CREATE INDEX relacion_correspondencia_destino ON relacion_correspondencia(id_direccion,id_correspondencia_relacionada)');
    await q.query(`CREATE TABLE movimiento_documento (
      id_movimiento_documento BIGSERIAL PRIMARY KEY, id_movimiento BIGINT NOT NULL, id_direccion BIGINT NOT NULL,
      id_documento BIGINT NOT NULL, numero_version_fijada INTEGER NOT NULL CHECK(numero_version_fijada>0),
      fecha_vinculacion TIMESTAMPTZ NOT NULL DEFAULT now(), vinculado_por BIGINT NOT NULL REFERENCES usuario(id_usuario),
      fecha_desvinculacion TIMESTAMPTZ, desvinculado_por BIGINT REFERENCES usuario(id_usuario), motivo_desvinculacion VARCHAR(1000),
      FOREIGN KEY(id_movimiento,id_direccion) REFERENCES movimiento_correspondencia(id_movimiento,id_direccion),
      FOREIGN KEY(id_documento,id_direccion) REFERENCES documento(id_documento,id_direccion),
      FOREIGN KEY(id_documento,numero_version_fijada) REFERENCES version_documento(id_documento,numero_version),
      CHECK((fecha_desvinculacion IS NULL AND desvinculado_por IS NULL AND motivo_desvinculacion IS NULL) OR
      (fecha_desvinculacion>=fecha_vinculacion AND fecha_desvinculacion IS NOT NULL AND desvinculado_por IS NOT NULL AND motivo_desvinculacion IS NOT NULL AND btrim(motivo_desvinculacion)<>'')))`);
    await q.query('CREATE UNIQUE INDEX movimiento_documento_activo ON movimiento_documento(id_movimiento,id_documento) WHERE fecha_desvinculacion IS NULL');
  }
  async down():Promise<void>{throw new Error('La reversión requiere un procedimiento de restauración controlado: no eliminar historial de correspondencia.');}
}
