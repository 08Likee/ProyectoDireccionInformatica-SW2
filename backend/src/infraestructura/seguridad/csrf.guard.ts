import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { coincidenciaConstante } from './seguridad.util';

export const CSRF_COOKIE = 'di_csrf';
export const SESION_COOKIE = 'di_sesion';

export function leerCookie(req: Request, nombre: string): string | null {
  const valor = req.headers.cookie ?? '';
  for (const par of valor.split(';')) {
    const [key, ...resto] = par.trim().split('=');
    if (key === nombre) return resto.join('=') || null;
  }
  return null;
}

/** Doble envío: cookie host-only SameSite=Strict y cabecera personalizada, sin CORS entre orígenes. */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origen = req.headers.origin;
    const origenPermitido = process.env.APP_PUBLIC_URL ?? 'http://127.0.0.1:5174';
    if (origen && origen !== new URL(origenPermitido).origin) {
      throw new ForbiddenException('Solicitud no autorizada.');
    }
    const cookie = leerCookie(req, CSRF_COOKIE);
    const cabecera = req.header('x-csrf-token');
    if (!cookie || !cabecera || !coincidenciaConstante(cookie, cabecera)) {
      throw new ForbiddenException('Protección de solicitud inválida. Recarga la página.');
    }
    return true;
  }
}
