import { LimiteService } from './limite.service';

describe('Limitación de intentos', () => {
  it('bloquea el sexto intento dentro de una ventana de cinco', () => {
    const limite = new LimiteService();
    for (let i = 0; i < 5; i++) expect(() => limite.exigir('correo:test', 5, 15)).not.toThrow();
    expect(() => limite.exigir('correo:test', 5, 15)).toThrow('Demasiadas solicitudes');
  });

  it('permite eliminar un bloqueo luego del acceso exitoso', () => {
    const limite = new LimiteService();
    limite.exigir('correo:test', 1, 15);
    limite.limpiar('correo:test');
    expect(() => limite.exigir('correo:test', 1, 15)).not.toThrow();
  });
});
