import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { UsuarioFila } from './cuenta.tipos';

@Injectable()
export class CuentaRepository {
  constructor(private readonly db: DataSource) {}

  async usuarioPorCorreo(correo: string): Promise<UsuarioFila | null> {
    const filas = (await this.db.query('SELECT * FROM usuario WHERE correo=$1', [correo])) as UsuarioFila[];
    return filas[0] ?? null;
  }

  async usuarioPorId(id: string): Promise<UsuarioFila | null> {
    const filas = (await this.db.query('SELECT * FROM usuario WHERE id_usuario=$1', [id])) as UsuarioFila[];
    return filas[0] ?? null;
  }

  async enTransaccion<T>(fn: (qr: QueryRunner) => Promise<T>): Promise<T> {
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const resultado = await fn(qr);
      await qr.commitTransaction();
      return resultado;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async crearUsuario(
    qr: QueryRunner,
    entrada: { identificador: string; nombres: string; apellidos: string; correo: string; hash: string },
  ): Promise<UsuarioFila> {
    const filas = (await qr.query(
      `INSERT INTO usuario (identificador_personal, nombres, apellidos, correo, contrasena_hash)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [entrada.identificador, entrada.nombres, entrada.apellidos, entrada.correo, entrada.hash],
    )) as UsuarioFila[];
    return filas[0];
  }

  async nuevoComprobante(
    qr: QueryRunner,
    id: string,
    proposito: 'VERIFICACION' | 'RECUPERACION',
    hash: string,
    minutos: number,
  ): Promise<void> {
    await qr.query(
      `UPDATE comprobante_cuenta SET fecha_revocacion=now()
       WHERE id_usuario=$1 AND proposito=$2 AND fecha_consumo IS NULL AND fecha_revocacion IS NULL`,
      [id, proposito],
    );
    await qr.query(
      `INSERT INTO comprobante_cuenta (id_usuario,proposito,comprobante_hash,fecha_expiracion)
       VALUES ($1,$2,$3,now()+($4 * interval '1 minute'))`,
      [id, proposito, hash, minutos],
    );
  }

  async consumirComprobante(
    qr: QueryRunner,
    hash: string,
    proposito: 'VERIFICACION' | 'RECUPERACION',
  ): Promise<string | null> {
    // SELECT FOR UPDATE impide consumir dos veces el mismo comprobante, incluso en sesiones concurrentes.
    const filas = (await qr.query(
      `SELECT id_comprobante, id_usuario FROM comprobante_cuenta
       WHERE comprobante_hash=$1 AND proposito=$2 AND fecha_consumo IS NULL
         AND fecha_revocacion IS NULL AND fecha_expiracion>now() FOR UPDATE`,
      [hash, proposito],
    )) as Array<{ id_comprobante: string; id_usuario: string }>;
    const comprobante = filas[0];
    if (!comprobante) return null;
    await qr.query(
      'UPDATE comprobante_cuenta SET fecha_consumo=now() WHERE id_comprobante=$1',
      [comprobante.id_comprobante],
    );
    return String(comprobante.id_usuario);
  }

  async crearSesion(hash: string, id: string, minutos: number): Promise<void> {
    await this.db.query(
      `INSERT INTO sesion (identificador_seguro,id_usuario,fecha_expiracion)
       VALUES ($1,$2,now()+($3 * interval '1 minute'))`,
      [hash, id, minutos],
    );
  }

  async usuarioPorSesion(hash: string): Promise<UsuarioFila | null> {
    const filas = (await this.db.query(
      `SELECT u.* FROM sesion s JOIN usuario u ON u.id_usuario=s.id_usuario
       WHERE s.identificador_seguro=$1 AND s.fecha_invalidacion IS NULL
         AND s.fecha_expiracion>now() AND u.estado_cuenta='ACTIVA'`,
      [hash],
    )) as UsuarioFila[];
    return filas[0] ?? null;
  }

  async renovarSesion(hash: string, minutos: number): Promise<void> {
    await this.db.query(
      `UPDATE sesion SET fecha_expiracion=now()+($2 * interval '1 minute')
       WHERE identificador_seguro=$1 AND fecha_invalidacion IS NULL AND fecha_expiracion>now()`,
      [hash, minutos],
    );
  }

  async invalidarSesion(hash: string): Promise<void> {
    await this.db.query(
      `UPDATE sesion SET fecha_invalidacion=now(),motivo_invalidacion='CIERRE_SESION'
       WHERE identificador_seguro=$1 AND fecha_invalidacion IS NULL`,
      [hash],
    );
  }

  async invalidarTodas(qr: QueryRunner, id: string, motivo: string): Promise<void> {
    await qr.query(
      `UPDATE sesion SET fecha_invalidacion=now(),motivo_invalidacion=$2
       WHERE id_usuario=$1 AND fecha_invalidacion IS NULL`,
      [id, motivo],
    );
  }

  async actualizarPerfil(id: string, nombres: string, apellidos: string): Promise<UsuarioFila> {
    await this.db.query(
      `UPDATE usuario SET nombres=$2,apellidos=$3,fecha_actualizacion=now()
       WHERE id_usuario=$1 AND estado_cuenta='ACTIVA'`,
      [id, nombres, apellidos],
    );
    const actualizado = await this.usuarioPorId(id);
    if (!actualizado) throw new Error('No se pudo recuperar el perfil actualizado.');
    return actualizado;
  }
}
