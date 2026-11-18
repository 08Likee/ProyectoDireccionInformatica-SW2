import { BadRequestException } from '@nestjs/common';
import { contrasenaValida } from '../../infraestructura/seguridad/seguridad.util';

export function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new BadRequestException('La solicitud debe contener datos válidos.');
  }
  return valor as Record<string, unknown>;
}

export function campo(valor: unknown, nombre: string, max: number, min = 1): string {
  if (typeof valor !== 'string' || valor.trim().length < min || valor.trim().length > max) {
    throw new BadRequestException(`${nombre}: valor no válido.`);
  }
  return valor.trim();
}

export function correoNormalizado(valor: unknown): string {
  const correo = campo(valor, 'Correo electrónico', 150, 5).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new BadRequestException('Correo electrónico no válido.');
  }
  return correo;
}

export function nuevaContrasena(datos: Record<string, unknown>, nombre = 'contrasena'): string {
  const clave = datos[nombre];
  const confirmacion = datos.confirmarContrasena;
  if (!contrasenaValida(clave)) {
    throw new BadRequestException('La contraseña debe tener entre 15 y 128 caracteres, con mayúsculas, minúsculas, números y símbolos.');
  }
  if (clave !== confirmacion) throw new BadRequestException('Las contraseñas no coinciden.');
  return clave;
}

export function tokenValido(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(valor)) {
    throw new BadRequestException('El enlace no es válido o ha expirado.');
  }
  return valor;
}
