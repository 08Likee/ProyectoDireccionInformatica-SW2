import { ExecutionContext } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

function contexto(metodo: string, tokenCookie?: string, tokenCabecera?: string, origin?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({
      method: metodo,
      headers: { cookie: tokenCookie ? `di_csrf=${tokenCookie}` : '', ...(origin ? { origin } : {}) },
      header: (nombre: string) => nombre === 'x-csrf-token' ? tokenCabecera : undefined,
    }) }),
  } as unknown as ExecutionContext;
}

describe('Protección CSRF', () => {
  const guard = new CsrfGuard();
  it('permite lectura sin token', () => expect(guard.canActivate(contexto('GET'))).toBe(true));
  it('rechaza mutación sin cookie y cabecera coincidentes', () => {
    expect(() => guard.canActivate(contexto('POST'))).toThrow();
    expect(() => guard.canActivate(contexto('POST', 'abc', 'diferente'))).toThrow();
  });
  it('admite mutaciones con doble envío correcto', () => {
    expect(guard.canActivate(contexto('PUT', 'valor-csrf', 'valor-csrf'))).toBe(true);
  });
  it('rechaza un origen ajeno aunque el token coincida', () => {
    expect(() => guard.canActivate(contexto('POST', 'abc', 'abc', 'https://host-ajeno.example'))).toThrow();
  });
});
