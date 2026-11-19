import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuditoriaPage } from './AuditoriaPage';

afterEach(() => { cleanup();vi.unstubAllGlobals(); });

const evento = { id:'3',fechaHora:'2026-11-18T18:00:00.000Z',accion:'ROL_ASIGNAR',actor:'Directora de Carrera',
  entidad:'ROL',identificadorEntidad:'3',tipoActor:'HUMANO',resultado:'EXITO',origen:'APLICACION' };

type RespuestaApiSimulada = { ok: boolean; json: () => Promise<unknown> };

function simularApi() {
  const llamada = vi.fn(async (url: string): Promise<RespuestaApiSimulada> => ({
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


describe('Navegación accesible al detalle de auditoría',()=>{
  it('desplaza al panel, mueve el foco y vuelve al evento al cerrar',async()=>{
    simularApi();
    const mover=vi.fn();
    const original=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:mover});
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    try {
      render(<AuditoriaPage/>);
      const boton=await screen.findByRole('button',{name:'Ver detalle del evento 3'});
      fireEvent.click(boton);
      const panel=await screen.findByRole('region',{name:'Detalle de evento'});
      await waitFor(()=>expect(mover).toHaveBeenCalledWith({behavior:'smooth',block:'start'}));
      expect(mover.mock.contexts[0]).toBe(panel);
      expect(document.activeElement).toBe(panel);
      expect(await screen.findByText(/Rol de prueba/)).toBeTruthy();
      expect(panel.getAttribute('aria-busy')).toBe('false');
      const desplazamientos=mover.mock.calls.length;
      fireEvent.click(boton);
      expect(mover).toHaveBeenCalledTimes(desplazamientos+1);
      fireEvent.click(screen.getByRole('button',{name:'Cerrar detalle'}));
      expect(screen.queryByRole('region',{name:'Detalle de evento'})).toBeNull();
      expect(document.activeElement).toBe(boton);
    } finally {
      if(original)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',original);
      else delete (HTMLElement.prototype as {scrollIntoView?:unknown}).scrollIntoView;
    }
  });

  it('respeta el movimiento reducido y muestra el error de consulta en el panel enfocado',async()=>{
    const llamada=simularApi();
    const responder=llamada.getMockImplementation()!;
    llamada.mockImplementation(async (url:string)=>url.includes('/eventos/3')
      ? {ok:false,json:async()=>({message:'Permiso insuficiente.'})} : responder(url));
    const mover=vi.fn();
    const original=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:mover});
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));
    try {
      render(<AuditoriaPage/>);
      fireEvent.click(await screen.findByRole('button',{name:'Ver detalle del evento 3'}));
      const panel=await screen.findByRole('region',{name:'Detalle de evento'});
      expect(await screen.findByText('Permiso insuficiente.')).toBeTruthy();
      expect(mover).toHaveBeenCalledWith({behavior:'instant',block:'start'});
      expect(document.activeElement).toBe(panel);
      expect(panel.getAttribute('aria-busy')).toBe('false');
      expect(screen.queryByText(/Rol de prueba/)).toBeNull();
    } finally {
      if(original)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',original);
      else delete (HTMLElement.prototype as {scrollIntoView?:unknown}).scrollIntoView;
    }
  });
});
