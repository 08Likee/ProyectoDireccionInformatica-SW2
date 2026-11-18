import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const PARAMETROS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function tokenAleatorio(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function coincidenciaConstante(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function contieneCaracteresControl(texto: string): boolean {
  return Array.from(texto).some(caracter => {
    const codigo = caracter.charCodeAt(0);
    return codigo < 32 || codigo === 127;
  });
}

export function contrasenaValida(clave: unknown): clave is string {
  return typeof clave === 'string'
    && clave.length >= 15 && clave.length <= 128
    && /[A-Z]/.test(clave) && /[a-z]/.test(clave)
    && /[0-9]/.test(clave) && /[^A-Za-z0-9\s]/.test(clave)
    && !contieneCaracteresControl(clave);
}

function derivar(clave: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(clave, salt, 64, PARAMETROS, (error, salida) => {
    if (error) reject(error); else resolve(salida);
  }));
}

export async function hashearContrasena(clave: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await derivar(clave, salt);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
}

export async function verificarContrasena(clave: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt' || partes[1] !== '16384'
    || partes[2] !== '8' || partes[3] !== '1'
    || !/^[a-f0-9]{32}$/.test(partes[4]) || !/^[a-f0-9]{128}$/.test(partes[5])) {
    return false;
  }
  const real = Buffer.from(partes[5], 'hex');
  const calculado = await derivar(clave, Buffer.from(partes[4], 'hex'));
  return timingSafeEqual(real, calculado);
}
