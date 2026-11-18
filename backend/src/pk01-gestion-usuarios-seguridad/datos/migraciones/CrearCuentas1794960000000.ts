import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tablas CU-01: esquema físico de PK01, documento oficial SW2, tablas 89-91. */
export class CrearCuentas1794960000000 implements MigrationInterface {
  name = 'CrearCuentas1794960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE usuario (
        id_usuario BIGSERIAL PRIMARY KEY,
        identificador_personal VARCHAR(20) NOT NULL UNIQUE,
        nombres VARCHAR(100) NOT NULL,
        apellidos VARCHAR(100) NOT NULL,
        correo VARCHAR(150) NOT NULL UNIQUE,
        contrasena_hash TEXT NOT NULL,
        estado_cuenta VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        fecha_verificacion TIMESTAMPTZ,
        fecha_cambio_contrasena TIMESTAMPTZ NOT NULL DEFAULT now(),
        fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
        fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT usuario_estado_valido CHECK (estado_cuenta IN ('PENDIENTE','ACTIVA','SUSPENDIDA')),
        CONSTRAINT usuario_correo_normalizado CHECK (correo = lower(btrim(correo)))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE sesion (
        id_sesion BIGSERIAL PRIMARY KEY,
        identificador_seguro TEXT NOT NULL UNIQUE,
        fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
        fecha_expiracion TIMESTAMPTZ NOT NULL,
        fecha_invalidacion TIMESTAMPTZ,
        motivo_invalidacion TEXT,
        id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX sesion_usuario_vigencia ON sesion(id_usuario, fecha_expiracion) WHERE fecha_invalidacion IS NULL');
    await queryRunner.query(`
      CREATE TABLE comprobante_cuenta (
        id_comprobante BIGSERIAL PRIMARY KEY,
        proposito VARCHAR(30) NOT NULL,
        comprobante_hash TEXT NOT NULL UNIQUE,
        fecha_emision TIMESTAMPTZ NOT NULL DEFAULT now(),
        fecha_expiracion TIMESTAMPTZ NOT NULL,
        fecha_consumo TIMESTAMPTZ,
        fecha_revocacion TIMESTAMPTZ,
        id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
        CONSTRAINT comprobante_proposito_valido CHECK (proposito IN ('VERIFICACION','RECUPERACION'))
      )
    `);
    await queryRunner.query('CREATE INDEX comprobante_usuario_proposito ON comprobante_cuenta(id_usuario, proposito, fecha_expiracion)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS comprobante_cuenta');
    await queryRunner.query('DROP TABLE IF EXISTS sesion');
    await queryRunner.query('DROP TABLE IF EXISTS usuario');
  }
}
