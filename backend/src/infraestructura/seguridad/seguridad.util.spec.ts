import { contrasenaValida, hashearContrasena, hashToken, tokenAleatorio, verificarContrasena } from './seguridad.util';

describe('Credenciales y comprobantes', () => {
  it('exige longitud y cuatro clases de caracteres', () => {
    expect(contrasenaValida('LpM12345!')).toBe(false);
    expect(contrasenaValida('ClaveInstitucional_2026!')).toBe(true);
    expect(contrasenaValida('clavesincapitales123!')).toBe(false);
    expect(contrasenaValida('CLAVESINMINUSCULAS123!')).toBe(false);
  });

  it('guarda hashes scrypt aleatorios y verifica con tiempo constante', async () => {
    const primero = await hashearContrasena('ClaveInstitucional_2026!');
    const segundo = await hashearContrasena('ClaveInstitucional_2026!');
    expect(primero).not.toBe(segundo);
    expect(primero).not.toContain('ClaveInstitucional');
    expect(await verificarContrasena('ClaveInstitucional_2026!', primero)).toBe(true);
    expect(await verificarContrasena('ClaveErronea_2026!', primero)).toBe(false);
    expect(await verificarContrasena('ClaveInstitucional_2026!', 'hash-invalido')).toBe(false);
  });

  it('no almacena el token en texto plano', () => {
    const token = tokenAleatorio();
    expect(token).toHaveLength(43);
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toBe(token);
  });
});
