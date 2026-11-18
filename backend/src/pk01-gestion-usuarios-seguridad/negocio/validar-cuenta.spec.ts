import { correoNormalizado, nuevaContrasena, objeto, tokenValido } from './validar-cuenta';

describe('Validación de cuenta', () => {
  it('normaliza correo y rechaza entradas no válidas', () => {
    expect(correoNormalizado('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
    expect(() => correoNormalizado('no-es-correo')).toThrow();
    expect(() => objeto([])).toThrow();
  });
  it('requiere confirmación idéntica de la nueva contraseña', () => {
    expect(nuevaContrasena({ contrasena: 'ClaveInstitucional_2026!', confirmarContrasena: 'ClaveInstitucional_2026!' })).toBe('ClaveInstitucional_2026!');
    expect(() => nuevaContrasena({ contrasena: 'ClaveInstitucional_2026!', confirmarContrasena: 'otra' })).toThrow();
  });
  it('verifica el formato de comprobantes aleatorios', () => {
    expect(() => tokenValido('valor-invalido')).toThrow();
  });
});
