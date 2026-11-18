/** Prueba de integración real con PostgreSQL. Ejecutar con: npm run test:integration */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../app.module';
import { CorreoService } from './negocio/correo.service';

describe('CU-01 integración HTTP + PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  const correoSimulado = {
    enviar: jest.fn<Promise<void>, [string, string, string]>().mockResolvedValue(undefined),
  };
  const identificador = randomBytes(8).toString('hex');
  const correo = `cu01-${identificador}@example.invalid`;
  const clave = 'ClaveInstitucional_2026!';
  const claveNueva = 'OtraClaveSegura_2027!';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CorreoService).useValue(correoSimulado).compile();
    app = mod.createNestApplication();
    await app.init();
    db = app.get(DataSource);
  }, 60_000);

  afterAll(async () => {
    if (db?.isInitialized) await db.query('DELETE FROM usuario WHERE correo=$1', [correo]);
    if (app) await app.close();
  });

  function cookiesRespuesta(cabecera: string | string[] | undefined): string[] {
    if (Array.isArray(cabecera)) return cabecera;
    return cabecera ? [cabecera] : [];
  }

  async function csrf(): Promise<{ cookie: string; token: string }> {
    const respuesta = await request(app.getHttpServer()).get('/api/cuenta/csrf').expect(200);
    const cookies = cookiesRespuesta(respuesta.headers['set-cookie']);
    return {
      cookie: cookies.find(x => x.startsWith('di_csrf='))!.split(';')[0],
      token: respuesta.body.csrfToken as string,
    };
  }

  function enlaceEnviado(): string {
    const ultimaLlamada = correoSimulado.enviar.mock.calls.at(-1);
    const ruta = ultimaLlamada?.[2];
    if (!ruta) throw new Error('No se generó un enlace de correo.');
    return new URLSearchParams(ruta.split('#')[1]).get('token')!;
  }

  it('registro, verificación, sesión, perfil, CSRF, recuperación y revocación', async () => {
    const ant = await csrf();
    await request(app.getHttpServer()).post('/api/cuenta/registro')
      .set('Cookie', ant.cookie).set('x-csrf-token', ant.token)
      .send({ identificadorPersonal: identificador, nombres: 'Prueba', apellidos: 'Institucional', correo,
        contrasena: clave, confirmarContrasena: clave }).expect(201);
    expect(correoSimulado.enviar).toHaveBeenCalledTimes(1);
    const cuentaSinPermisos = await db.query('SELECT * FROM usuario WHERE correo=$1', [correo]) as Array<{ estado_cuenta: string }>;
    expect(cuentaSinPermisos[0].estado_cuenta).toBe('PENDIENTE');

    const sinVerificar = await csrf();
    await request(app.getHttpServer()).post('/api/cuenta/login')
      .set('Cookie', sinVerificar.cookie).set('x-csrf-token', sinVerificar.token)
      .send({ correo, contrasena: clave }).expect(401);

    const comprobante = enlaceEnviado();
    const ver = await csrf();
    await request(app.getHttpServer()).post('/api/cuenta/verificar')
      .set('Cookie', ver.cookie).set('x-csrf-token', ver.token).send({ token: comprobante }).expect(200);
    await request(app.getHttpServer()).post('/api/cuenta/verificar')
      .set('Cookie', ver.cookie).set('x-csrf-token', ver.token).send({ token: comprobante }).expect(400);

    const acceso = await csrf();
    const login = await request(app.getHttpServer()).post('/api/cuenta/login')
      .set('Cookie', acceso.cookie).set('x-csrf-token', acceso.token)
      .send({ correo, contrasena: clave }).expect(200);
    expect(login.body.perfil.permisosInstitucionales).toEqual([]);
    const cookieSesion = cookiesRespuesta(login.headers['set-cookie'])
      .find(x => x.startsWith('di_sesion='))!.split(';')[0];
    const cookiesAutenticadas = `${acceso.cookie}; ${cookieSesion}`;
    await request(app.getHttpServer()).get('/api/cuenta/perfil').set('Cookie', cookiesAutenticadas).expect(200);
    await request(app.getHttpServer()).put('/api/cuenta/perfil')
      .set('Cookie', cookiesAutenticadas).send({ nombres: 'Nuevo', apellidos: 'Apellido' }).expect(403);
    const perfil = await request(app.getHttpServer()).put('/api/cuenta/perfil')
      .set('Cookie', cookiesAutenticadas).set('x-csrf-token', acceso.token)
      .send({ nombres: 'Nuevo', apellidos: 'Apellido' }).expect(200);
    expect(perfil.body.perfil.nombres).toBe('Nuevo');
    await request(app.getHttpServer()).put('/api/cuenta/perfil')
      .set('Cookie', cookiesAutenticadas).set('x-csrf-token', acceso.token)
      .send({ nombres: 'Otro', apellidos: 'Apellido', rol: 'DIRECTOR' }).expect(400);

    const rec = await csrf();
    await request(app.getHttpServer()).post('/api/cuenta/recuperacion/solicitar')
      .set('Cookie', rec.cookie).set('x-csrf-token', rec.token).send({ correo }).expect(200);
    const tokenRecuperacion = enlaceEnviado();
    const nuevo = await csrf();
    await request(app.getHttpServer()).post('/api/cuenta/recuperacion/confirmar')
      .set('Cookie', nuevo.cookie).set('x-csrf-token', nuevo.token)
      .send({ token: tokenRecuperacion, nuevaContrasena: claveNueva, confirmarContrasena: claveNueva }).expect(200);
    await request(app.getHttpServer()).get('/api/cuenta/sesion').set('Cookie', cookieSesion).expect(401);
    await request(app.getHttpServer()).post('/api/cuenta/login')
      .set('Cookie', nuevo.cookie).set('x-csrf-token', nuevo.token)
      .send({ correo, contrasena: clave }).expect(401);
    await request(app.getHttpServer()).post('/api/cuenta/login')
      .set('Cookie', nuevo.cookie).set('x-csrf-token', nuevo.token)
      .send({ correo, contrasena: claveNueva }).expect(200);
  }, 90_000);
});
