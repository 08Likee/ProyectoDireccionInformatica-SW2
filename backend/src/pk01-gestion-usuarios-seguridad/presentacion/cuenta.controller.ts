import { Body, Controller, Get, HttpCode, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CuentaService } from '../negocio/cuenta.service';
import { LimiteService } from '../../infraestructura/seguridad/limite.service';
import { CSRF_COOKIE, leerCookie, SESION_COOKIE } from '../../infraestructura/seguridad/csrf.guard';
import { tokenAleatorio } from '../../infraestructura/seguridad/seguridad.util';

const MINUTOS_SESION = 30;
function opcionesCookie(httpOnly: boolean) {
  return {
    httpOnly,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

@Controller('api/cuenta')
export class CuentaController {
  constructor(private readonly cuenta: CuentaService, private readonly limites: LimiteService) {}

  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const token = tokenAleatorio();
    res.cookie(CSRF_COOKIE, token, { ...opcionesCookie(false), maxAge: 2 * 60 * 60 * 1000 });
    res.setHeader('Cache-Control', 'no-store');
    return { csrfToken: token };
  }

  @Post('registro')
  async registrar(@Req() req: Request, @Body() entrada: unknown) {
    this.limites.exigir(`registro:${req.ip}`, 10, 60);
    const resultado = await this.cuenta.registrar(entrada);
    return { mensaje: 'Cuenta registrada. Revisa tu correo para verificarla.', ...resultado };
  }

  @Post('verificar')
  @HttpCode(200)
  async verificar(@Body() entrada: unknown) {
    await this.cuenta.verificar(entrada);
    return { mensaje: 'Tu correo fue verificado. Ya puedes iniciar sesión.' };
  }

  @Post('verificacion/reenviar')
  @HttpCode(200)
  async reenviar(@Req() req: Request, @Body() entrada: unknown) {
    this.limites.exigir(`reenviar:${req.ip}`, 5, 30);
    await this.cuenta.reenviarVerificacion(entrada);
    return { mensaje: 'Si la cuenta necesita verificación, recibirás un correo.' };
  }

  @Post('login')
  @HttpCode(200)
  async iniciar(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() entrada: unknown) {
    const correo = typeof (entrada as { correo?: unknown } | null)?.correo === 'string'
      ? (entrada as { correo: string }).correo.toLowerCase().trim() : '';
    this.limites.exigir(`login:${correo}`, 5, 15);
    this.limites.exigir(`login-ip:${req.ip}`, 50, 15);
    const resultado = await this.cuenta.iniciar(entrada);
    res.cookie(SESION_COOKIE, resultado.token, { ...opcionesCookie(true), maxAge: MINUTOS_SESION * 60_000 });
    res.setHeader('Cache-Control', 'no-store');
    return { perfil: resultado.perfil };
  }

  @Get('sesion')
  async sesion(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const perfil = await this.cuenta.consultarSesion(leerCookie(req, SESION_COOKIE));
    res.cookie(SESION_COOKIE, leerCookie(req, SESION_COOKIE)!, {
      ...opcionesCookie(true), maxAge: MINUTOS_SESION * 60_000,
    });
    res.setHeader('Cache-Control', 'no-store');
    return { perfil };
  }

  @Post('logout')
  @HttpCode(200)
  async cerrar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.cuenta.cerrar(leerCookie(req, SESION_COOKIE));
    res.clearCookie(SESION_COOKIE, opcionesCookie(true));
    return { mensaje: 'Sesión cerrada.' };
  }

  @Post('recuperacion/solicitar')
  @HttpCode(200)
  async recuperar(@Req() req: Request, @Body() entrada: unknown) {
    this.limites.exigir(`recuperar:${req.ip}`, 10, 60);
    await this.cuenta.solicitarRecuperacion(entrada);
    return { mensaje: 'Si existe una cuenta activa, recibirás un enlace de recuperación.' };
  }

  @Post('recuperacion/confirmar')
  @HttpCode(200)
  async confirmarRecuperacion(@Body() entrada: unknown) {
    await this.cuenta.confirmarRecuperacion(entrada);
    return { mensaje: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }

  @Put('contrasena')
  async cambiarClave(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() entrada: unknown) {
    await this.cuenta.cambiarContrasena(leerCookie(req, SESION_COOKIE), entrada);
    res.clearCookie(SESION_COOKIE, opcionesCookie(true));
    return { mensaje: 'Contraseña actualizada. Vuelve a iniciar sesión.' };
  }

  @Get('perfil')
  async perfil(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = leerCookie(req, SESION_COOKIE);
    const perfil = await this.cuenta.consultarSesion(token);
    res.cookie(SESION_COOKIE, token!, { ...opcionesCookie(true), maxAge: MINUTOS_SESION * 60_000 });
    res.setHeader('Cache-Control', 'no-store');
    return { perfil };
  }

  @Put('perfil')
  async editarPerfil(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() entrada: unknown) {
    const token = leerCookie(req, SESION_COOKIE);
    const perfil = await this.cuenta.actualizarPerfil(token, entrada);
    res.cookie(SESION_COOKIE, token!, { ...opcionesCookie(true), maxAge: MINUTOS_SESION * 60_000 });
    res.setHeader('Cache-Control', 'no-store');
    return { perfil };
  }
}
