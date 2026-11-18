import {
  BadRequestException, ConflictException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CuentaRepository } from '../datos/cuenta.repository';
import { PerfilPublico, perfilPublico, UsuarioFila } from '../datos/cuenta.tipos';
import { CorreoService } from './correo.service';
import { LimiteService } from '../../infraestructura/seguridad/limite.service';
import {
  hashearContrasena, hashToken, tokenAleatorio, verificarContrasena,
} from '../../infraestructura/seguridad/seguridad.util';
import { campo, correoNormalizado, nuevaContrasena, objeto, tokenValido } from './validar-cuenta';

const MINUTOS_SESION = 30;

@Injectable()
export class CuentaService {
  private readonly hashFicticio = hashearContrasena('CuentaSinDatos_2026!Segura');

  constructor(
    private readonly repositorio: CuentaRepository,
    private readonly correo: CorreoService,
    private readonly limites: LimiteService,
  ) {}

  private registroUnico(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driver = error.driverError as { code?: string } | undefined;
      if (driver?.code === '23505') throw new ConflictException('El correo o identificador ya está registrado.');
    }
    throw error;
  }

  async registrar(entrada: unknown): Promise<{ correo: string }> {
    const d = objeto(entrada);
    const identificador = campo(d.identificadorPersonal, 'Identificador personal', 20);
    const nombres = campo(d.nombres, 'Nombres', 100);
    const apellidos = campo(d.apellidos, 'Apellidos', 100);
    const correo = correoNormalizado(d.correo);
    const contrasena = nuevaContrasena(d);
    const hash = await hashearContrasena(contrasena);
    const token = tokenAleatorio();
    try {
      await this.repositorio.enTransaccion(async qr => {
        const usuario = await this.repositorio.crearUsuario(qr, { identificador, nombres, apellidos, correo, hash });
        await this.repositorio.nuevoComprobante(qr, String(usuario.id_usuario), 'VERIFICACION', hashToken(token), 1440);
      });
    } catch (error) { this.registroUnico(error); }
    await this.correo.enviar(correo, 'Verifica tu cuenta institucional', `/verificar#token=${token}`);
    return { correo };
  }

  async reenviarVerificacion(entrada: unknown): Promise<void> {
    const correo = correoNormalizado(objeto(entrada).correo);
    const usuario = await this.repositorio.usuarioPorCorreo(correo);
    if (!usuario || usuario.estado_cuenta !== 'PENDIENTE') return;
    const token = tokenAleatorio();
    await this.repositorio.enTransaccion(qr =>
      this.repositorio.nuevoComprobante(qr, String(usuario.id_usuario), 'VERIFICACION', hashToken(token), 1440),
    );
    // La respuesta es indistinguible para cuentas inexistentes y pendientes.
    try { await this.correo.enviar(correo, 'Verifica tu cuenta institucional', `/verificar#token=${token}`); } catch { /* error registrado por CorreoService */ }
  }

  async verificar(entrada: unknown): Promise<void> {
    const token = tokenValido(objeto(entrada).token);
    const id = await this.repositorio.enTransaccion(async qr => {
      const encontrado = await this.repositorio.consumirComprobante(qr, hashToken(token), 'VERIFICACION');
      if (!encontrado) throw new BadRequestException('El enlace no es válido o ha expirado.');
      const cuentas = (await qr.query('SELECT estado_cuenta FROM usuario WHERE id_usuario=$1 FOR UPDATE', [encontrado])) as Array<{ estado_cuenta: string }>;
      if (cuentas[0]?.estado_cuenta !== 'PENDIENTE') throw new BadRequestException('La cuenta no está pendiente de verificación.');
      await qr.query(
        `UPDATE usuario SET estado_cuenta='ACTIVA', fecha_verificacion=now(), fecha_actualizacion=now()
         WHERE id_usuario=$1 AND estado_cuenta='PENDIENTE'`,
        [encontrado],
      );
      return encontrado;
    });
    if (!id) throw new BadRequestException('No se pudo verificar la cuenta.');
  }

  async iniciar(entrada: unknown): Promise<{ token: string; perfil: PerfilPublico }> {
    const d = objeto(entrada);
    const correo = correoNormalizado(d.correo);
    if (typeof d.contrasena !== 'string' || d.contrasena.length > 128) {
      throw new UnauthorizedException('Credenciales incorrectas o cuenta no habilitada.');
    }
    const usuario = await this.repositorio.usuarioPorCorreo(correo);
    const hash = usuario?.contrasena_hash ?? await this.hashFicticio;
    const correcta = await verificarContrasena(d.contrasena, hash);
    if (!usuario || !correcta || usuario.estado_cuenta !== 'ACTIVA') {
      throw new UnauthorizedException('Credenciales incorrectas o cuenta no habilitada.');
    }
    const token = tokenAleatorio();
    await this.repositorio.crearSesion(hashToken(token), String(usuario.id_usuario), MINUTOS_SESION);
    this.limites.limpiar(`login:${correo}`);
    return { token, perfil: perfilPublico(usuario) };
  }

  async usuarioSesion(token: string | null): Promise<UsuarioFila> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException('Inicia sesión para continuar.');
    }
    const hash = hashToken(token);
    const usuario = await this.repositorio.usuarioPorSesion(hash);
    if (!usuario) throw new UnauthorizedException('Tu sesión ha expirado o fue cerrada.');
    await this.repositorio.renovarSesion(hash, MINUTOS_SESION);
    return usuario;
  }

  async consultarSesion(token: string | null): Promise<PerfilPublico> {
    return perfilPublico(await this.usuarioSesion(token));
  }

  async cerrar(token: string | null): Promise<void> {
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      await this.repositorio.invalidarSesion(hashToken(token));
    }
  }

  async solicitarRecuperacion(entrada: unknown): Promise<void> {
    const correo = correoNormalizado(objeto(entrada).correo);
    const usuario = await this.repositorio.usuarioPorCorreo(correo);
    if (!usuario || usuario.estado_cuenta !== 'ACTIVA') return;
    const token = tokenAleatorio();
    await this.repositorio.enTransaccion(qr =>
      this.repositorio.nuevoComprobante(qr, String(usuario.id_usuario), 'RECUPERACION', hashToken(token), 30),
    );
    // No revelar la existencia de la cuenta incluso ante fallos del proveedor SMTP.
    try { await this.correo.enviar(correo, 'Recuperar acceso a tu cuenta', `/recuperar#token=${token}`); } catch { /* error registrado por CorreoService */ }
  }

  async confirmarRecuperacion(entrada: unknown): Promise<void> {
    const d = objeto(entrada);
    const token = tokenValido(d.token);
    const hash = await hashearContrasena(nuevaContrasena(d, 'nuevaContrasena'));
    await this.repositorio.enTransaccion(async qr => {
      const id = await this.repositorio.consumirComprobante(qr, hashToken(token), 'RECUPERACION');
      if (!id) throw new BadRequestException('El enlace no es válido o ha expirado.');
      const cuentas = (await qr.query('SELECT estado_cuenta FROM usuario WHERE id_usuario=$1 FOR UPDATE', [id])) as Array<{ estado_cuenta: string }>;
      if (cuentas[0]?.estado_cuenta !== 'ACTIVA') throw new BadRequestException('La cuenta no está habilitada.');
      await qr.query(
        `UPDATE usuario SET contrasena_hash=$2, fecha_cambio_contrasena=now(), fecha_actualizacion=now()
         WHERE id_usuario=$1 AND estado_cuenta='ACTIVA'`,
        [id, hash],
      );
      await this.repositorio.invalidarTodas(qr, id, 'RECUPERACION');
    });
  }

  async cambiarContrasena(token: string | null, entrada: unknown): Promise<void> {
    const usuario = await this.usuarioSesion(token);
    const d = objeto(entrada);
    if (typeof d.contrasenaActual !== 'string'
      || !await verificarContrasena(d.contrasenaActual, usuario.contrasena_hash)) {
      throw new UnauthorizedException('La contraseña actual es incorrecta.');
    }
    const nueva = nuevaContrasena(d, 'nuevaContrasena');
    if (await verificarContrasena(nueva, usuario.contrasena_hash)) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual.');
    }
    const hash = await hashearContrasena(nueva);
    await this.repositorio.enTransaccion(async qr => {
      await qr.query(
        `UPDATE usuario SET contrasena_hash=$2, fecha_cambio_contrasena=now(), fecha_actualizacion=now()
         WHERE id_usuario=$1`,
        [usuario.id_usuario, hash],
      );
      await this.repositorio.invalidarTodas(qr, String(usuario.id_usuario), 'CAMBIO_CONTRASENA');
    });
  }

  async actualizarPerfil(token: string | null, entrada: unknown): Promise<PerfilPublico> {
    const usuario = await this.usuarioSesion(token);
    const d = objeto(entrada);
    if (Object.keys(d).some(k => !['nombres', 'apellidos'].includes(k))) {
      throw new BadRequestException('Solo se pueden modificar nombres y apellidos.');
    }
    const nombres = campo(d.nombres, 'Nombres', 100);
    const apellidos = campo(d.apellidos, 'Apellidos', 100);
    const actualizado = await this.repositorio.actualizarPerfil(String(usuario.id_usuario), nombres, apellidos);
    return perfilPublico(actualizado);
  }
}
