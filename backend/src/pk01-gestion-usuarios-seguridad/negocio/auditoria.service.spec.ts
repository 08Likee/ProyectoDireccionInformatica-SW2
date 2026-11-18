import { AuditoriaService, camposAuditables } from './auditoria.service';
import { AutorizacionesRepository } from '../datos/autorizaciones.repository';
import { AuditoriaRepository } from '../datos/auditoria.repository';

const token = 'a'.repeat(43);
const direccion = { id: '11', codigo: 'DIR', nombre: 'Dirección permitida' };

function escenario() {
  const autorizaciones = { usuarioDeSesion: jest.fn().mockResolvedValue('7') };
  const repositorio = {
    ambitosConPermiso: jest.fn().mockResolvedValue([direccion]),
    listar: jest.fn().mockResolvedValue([]),
    detalle: jest.fn().mockResolvedValue(null),
  };
  const servicio = new AuditoriaService(autorizaciones as unknown as AutorizacionesRepository,
    repositorio as unknown as AuditoriaRepository);
  return { servicio, autorizaciones, repositorio };
}

describe('CU-03: permisos, ámbito, filtros y privacidad', () => {
  it('rechaza una consulta sin sesión o sin permiso específico', async () => {
    const { servicio, repositorio } = escenario();
    await expect(servicio.ambitos(null)).rejects.toMatchObject({ status: 401 });
    repositorio.ambitosConPermiso.mockResolvedValue([]);
    await expect(servicio.consultar(token, {})).rejects.toMatchObject({ status: 403 });
    expect(repositorio.listar).not.toHaveBeenCalled();
  });

  it('no permite seleccionar una Dirección ajena', async () => {
    const { servicio, repositorio } = escenario();
    await expect(servicio.consultar(token, { direccionId: '22' })).rejects.toMatchObject({ status: 403 });
    await expect(servicio.detalle(token, '1', '22')).rejects.toMatchObject({ status: 403 });
    expect(repositorio.listar).not.toHaveBeenCalled();
    expect(repositorio.detalle).not.toHaveBeenCalled();
  });

  it('valida fechas, paginación y filtros, sin consultar datos ante valores inválidos', async () => {
    const { servicio, repositorio } = escenario();
    await expect(servicio.consultar(token, { desde:'2026-02-30' })).rejects.toMatchObject({ status: 400 });
    await expect(servicio.consultar(token, { desde:'2026-11-20',hasta:'2026-11-18' })).rejects.toMatchObject({ status: 400 });
    await expect(servicio.consultar(token, { pagina:'101' })).rejects.toMatchObject({ status: 400 });
    await expect(servicio.consultar(token, { accion:['ROL_CREAR'] })).rejects.toMatchObject({ status: 400 });
    await expect(servicio.consultar(token, { desconocido:'dato' })).rejects.toMatchObject({ status: 400 });
    expect(repositorio.listar).not.toHaveBeenCalled();
  });

  it('acota los resultados y usa únicamente el ámbito autorizado', async () => {
    const { servicio, repositorio } = escenario();
    repositorio.listar.mockResolvedValue(Array.from({ length:21 }, (_, i) => ({
      id:String(i+1), identificadorEntidad:'secreto-no-numerico',accion:'ROL_CREAR',actor:'Funcionaria',
    })));
    const respuesta=await servicio.consultar(token, { direccionId:'11',pagina:'2',accion:'ROL' });
    expect(respuesta.eventos).toHaveLength(20);
    expect(respuesta.haySiguiente).toBe(true);
    expect(respuesta.eventos[0].identificadorEntidad).toBeNull();
    expect(repositorio.listar).toHaveBeenCalledWith('11',expect.objectContaining({accion:'ROL'}),2,20);
  });

  it('aplica los dos extremos del periodo por días civiles de Bolivia', async () => {
    const { servicio, repositorio } = escenario();
    await servicio.consultar(token,{direccionId:'11',desde:'2026-11-18',hasta:'2026-11-18'});
    expect(repositorio.listar).toHaveBeenCalledWith('11',expect.objectContaining({
      desde:'2026-11-18',hastaExclusiva:'2026-11-19',
    }),0,20);
  });

  it('nunca devuelve secretos guardados en el JSONB y limita detalles al ámbito', async () => {
    const { servicio, repositorio } = escenario();
    repositorio.detalle.mockResolvedValue({
      id:'5',fechaHora:new Date(),accion:'ROL_CREAR',entidad:'ROL',identificadorEntidad:'5',
      actor:'Directora',tipoActor:'HUMANO',resultado:'EXITO',origen:'APLICACION',
      identificadorCorrelacion:'uuid-prueba',datosAnteriores:{ password:'clave',token:'token',nombre:'Antes' },
      datosPosteriores:{ nombre:'Después',credenciales:{clave:'secreto'},motivo:'dato libre',
        permisos:['AUDITORIA_CONSULTAR'] },
    });
    const respuesta=await servicio.detalle(token,'5','11');
    expect(respuesta.evento.datosAnteriores).toEqual({nombre:'Antes'});
    expect(respuesta.evento.datosPosteriores).toEqual({nombre:'Después',permisos:['AUDITORIA_CONSULTAR']});
    expect(JSON.stringify(respuesta)).not.toContain('secreto');
    expect(JSON.stringify(respuesta)).not.toContain('clave');
  });

  it('pierde acceso en cuanto se revoca el permiso, incluso con sesión vigente', async () => {
    const { servicio, repositorio } = escenario();
    await expect(servicio.ambitos(token)).resolves.toEqual({direcciones:[direccion]});
    repositorio.ambitosConPermiso.mockResolvedValue([]);
    await expect(servicio.ambitos(token)).rejects.toMatchObject({status:403});
  });
});

describe('Protección adicional del detalle', () => {
  it('omite campos libres, anidados o sensibles, aun si un registro antiguo los contiene', () => {
    expect(camposAuditables({nombre:'Rol',contrasena:'123',token:'abc',usuarioId:'22',
      detalles:{correo:'privado'},motivo:'confidencial',permisos:['AUDITORIA_CONSULTAR']}))
      .toEqual({nombre:'Rol',usuarioId:'22',permisos:['AUDITORIA_CONSULTAR']});
    expect(camposAuditables(null)).toBeNull();
  });
});
