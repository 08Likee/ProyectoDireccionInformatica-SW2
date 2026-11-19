import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Almacén local privado. El identificador físico nunca deriva del nombre aportado por el usuario. */
@Injectable()
export class ArchivosPrivadosService {
  private readonly raiz = resolve(process.env.DOCUMENTOS_RAIZ ?? '/app/almacen-documentos');

  async guardar(buffer: Buffer): Promise<{ clave: string; sha256: string }> {
    const clave = randomUUID();
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    try {
      await mkdir(this.raiz, { recursive: true, mode: 0o700 });
      await chmod(this.raiz, 0o700);
      await writeFile(join(this.raiz, clave), buffer, { flag: 'wx', mode: 0o600 });
      return { clave, sha256 };
    } catch {
      throw new InternalServerErrorException('No se pudo conservar el archivo de forma segura.');
    }
  }

  async leer(clave: string, sha256: string): Promise<Buffer> {
    if (!/^[a-f0-9-]{36}$/.test(clave)) throw new NotFoundException('Archivo no disponible.');
    let buffer: Buffer;
    try { buffer = await readFile(join(this.raiz, clave)); }
    catch { throw new NotFoundException('No se pudo recuperar el archivo.'); }
    if (createHash('sha256').update(buffer).digest('hex') !== sha256.trim()) {
      throw new InternalServerErrorException('La verificación de integridad del archivo falló.');
    }
    return buffer;
  }

  async descartar(clave: string): Promise<void> {
    if (/^[a-f0-9-]{36}$/.test(clave)) await unlink(join(this.raiz,clave)).catch(() => {});
  }
}
