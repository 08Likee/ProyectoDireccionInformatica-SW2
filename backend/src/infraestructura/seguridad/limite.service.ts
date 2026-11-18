import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/** Limitador para una sola instancia del backend. Distribución multi-instancia requerirá Redis o BD. */
@Injectable()
export class LimiteService {
  private readonly registros = new Map<string, { intentos: number; vence: number }>();

  exigir(clave: string, maximo: number, minutos: number): void {
    const ahora = Date.now();
    if (this.registros.size > 10_000) {
      for (const [k, dato] of this.registros) if (dato.vence <= ahora) this.registros.delete(k);
    }
    if (this.registros.size >= 10_000 && !this.registros.has(clave)) {
      throw new HttpException('Demasiadas solicitudes. Intenta más tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const anterior = this.registros.get(clave);
    const nuevo = !anterior || anterior.vence <= ahora
      ? { intentos: 1, vence: ahora + minutos * 60_000 }
      : { ...anterior, intentos: anterior.intentos + 1 };
    this.registros.set(clave, nuevo);
    if (nuevo.intentos > maximo) throw new HttpException('Demasiadas solicitudes. Intenta más tarde.', HttpStatus.TOO_MANY_REQUESTS);
  }

  limpiar(clave: string): void { this.registros.delete(clave); }
}
