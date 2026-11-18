import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuditoriaPage } from './AuditoriaPage';

afterEach(() => { cleanup();vi.unstubAllGlobals(); });

const evento = { id:'3',fechaHora:'2026-11-18T18:00:00.000Z',accion:'ROL_ASIGNAR',actor:'Directora de Carrera',
  entidad:'ROL',identificadorEntidad:'3',tipoActor:'HUMANO',resultado:'EXITO',origen:'APLICACION' };

function simularApi() {
  const llamada = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => {
      if (url.includes('/cuenta/sesion')) return { perfil: { permisosInstitucionales: ['AUDITORIA_CONSULTAR'] } };
      if (url.includes('/direcciones')) return { direcciones:[{id:'7',codigo:'DIR',nombre:'Dirección de Ingeniería Informática'}] };
      if (url.includes('/eventos/3')) return { evento:{ ...evento,identificadorCorrelacion:'id-corr',
        datosAnteriores:null,datosPosteriores:{nombre:'Rol de prueba'} } };
      if (url.includes('/eventos?')) return { eventos:[evento], pagina:0,tamanoPagina:20,haySiguiente:false,
        direccion:{id:'7',codigo:'DIR',nombre:'Dirección de Ingeniería Informática'} };
      return {};
    },
  }));
  vi.stubGlobal('fetch', llamada);
  return llamada;
}

describe('Consulta de auditoría institucional', () => {
  it('muestra registros autorizados, filtros y navegación institucional', async () => {
    const fetchSimulado = simularApi();
    render(<AuditoriaPage />);
    expect(await screen.findByRole('heading',{name:'Bitácora de auditoría'})).toBeTruthy();
    expect(await screen.findByText('ROL_ASIGNAR')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Aplicar filtros'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Anterior'}).hasAttribute('disabled')).toBe(true);
    expect((await screen.findByRole('link',{name:'Auditoría'})).getAttribute('href')).toBe('/administracion/auditoria');
    await waitFor(()=>expect(fetchSimulado).toHaveBeenCalledWith(expect.stringContaining('direccionId=7'),
      expect.objectContaining({credentials:'same-origin'})));
    expect(document.body.textContent).not.toMatch(/beta|CU-03|prototipo/i);
  });

  it('permite abrir el detalle depurado de un evento', async () => {
    simularApi();
    render(<AuditoriaPage />);
    const boton = await screen.findByRole('button',{name:'Ver detalle del evento 3'});
    boton.click();
    expect(await screen.findByRole('heading',{name:'Detalle de evento'})).toBeTruthy();
    expect(await screen.findByText(/Rol de prueba/)).toBeTruthy();
    expect(screen.getByText(/campos protegidos/i)).toBeTruthy();
  });

  it('muestra acceso restringido sin exponer la tabla si no hay permiso', async () => {
    vi.stubGlobal('fetch',vi.fn(async ()=>({ok:false,json:async()=>({message:'Permiso insuficiente.'})})));
    render(<AuditoriaPage />);
    expect(await screen.findByRole('heading',{name:'Acceso restringido'})).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
