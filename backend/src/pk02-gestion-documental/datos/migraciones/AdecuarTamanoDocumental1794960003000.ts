import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-07: alinear el techo de persistencia con el límite operativo configurable (1–50 MiB). */
export class AdecuarTamanoDocumental1794960003000 implements MigrationInterface {
  name = 'AdecuarTamanoDocumental1794960003000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE version_documento
      DROP CONSTRAINT version_documento_tamano_bytes_check,
      ADD CONSTRAINT version_documento_tamano_bytes_check
      CHECK (tamano_bytes > 0 AND tamano_bytes <= 52428800)`);
  }

  async down(q: QueryRunner): Promise<void> {
    // La reversión debe fallar sin eliminar datos si ya existen versiones superiores a 10 MiB.
    await q.query(`ALTER TABLE version_documento
      DROP CONSTRAINT version_documento_tamano_bytes_check,
      ADD CONSTRAINT version_documento_tamano_bytes_check
      CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760)`);
  }
}
