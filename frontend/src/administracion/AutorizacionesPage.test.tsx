import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AutorizacionesPage } from './AutorizacionesPage';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('Administración institucional',()=>{
  it('presenta únicamente la gestión autorizada, con cabecera y formularios accesibles',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url:string)=>({ok:true,json:async()=>{
      if (url.includes('/contexto')) return {direccion:{id:'1',codigo:'DI_INFORMATICA',nombre:'Dirección de Ingeniería Informática'},permisos:['AUTORIZACIONES_ADMINISTRAR']};
      if (url.includes('/catalogo')) return {roles:[{id_rol:'3',nombre:'Coordinación',descripcion:'',es_sistema:false,
        version_control:0,estado:'ACTIVO',permisos:['DOCUMENTOS_CONSULTAR']}],
        permisos:[{id:'1',codigo:'AUTORIZACIONES_ADMINISTRAR',modulo:'Seguridad',operacion:'Administrar autorizaciones',descripcion:'Solo Director'},
          {id:'2',codigo:'DOCUMENTOS_CONSULTAR',modulo:'Documentos',operacion:'Consultar documentos',descripcion:'Consultar archivos'}]};
      return {asignaciones:[]};
    }})));
    render(<AutorizacionesPage/>);
    expect(screen.getByRole('heading',{name:'Roles y permisos'})).toBeTruthy();
    expect(await screen.findByText('Ámbito institucional autorizado')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Crear rol institucional'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Asignar rol directamente'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Asignar permiso directamente'})).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bbeta\b|CU-02|prototipo/i);
    expect(screen.queryByRole('checkbox',{name:/Administrar autorizaciones/i})).toBeNull();
  });

  it('no ofrece revocación ni cambios de vigencia para la autoridad protegida', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => {
      if (url.includes('/cuenta/sesion')) return { perfil: { permisosInstitucionales: ['AUTORIZACIONES_ADMINISTRAR'] } };
      if (url.includes('/contexto')) return { direccion: { id: '1', codigo: 'INFORMATICA', nombre: 'Dirección de Ingeniería Informática' }, permisos: ['AUTORIZACIONES_ADMINISTRAR'] };
      if (url.includes('/catalogo')) return { roles: [
        { id_rol: '1', nombre: 'Dirección de Carrera', descripcion: '', es_sistema: true, version_control: 0, estado: 'ACTIVO', permisos: ['AUTORIZACIONES_ADMINISTRAR'] },
        { id_rol: '2', nombre: 'Coordinador', descripcion: '', es_sistema: false, version_control: 0, estado: 'ACTIVO', permisos: [] },
      ], permisos: [] };
      return { asignaciones: [
        { id: '10', tipo: 'ROL', usuario_id: '1', destinatario: 'Cuenta directiva', referencia_id: '1', referencia: 'Dirección de Carrera', fecha_inicio: '2025-01-01T00:00:00Z', fecha_fin: null, fecha_revocacion: null },
        { id: '11', tipo: 'ROL', usuario_id: '2', destinatario: 'Cuenta coordinadora', referencia_id: '2', referencia: 'Coordinador', fecha_inicio: '2025-01-01T00:00:00Z', fecha_fin: null, fecha_revocacion: null },
      ] };
    } })));
    render(<AutorizacionesPage />);
    expect(await screen.findByText('Cuenta directiva')).toBeTruthy();
    const filaDirector = screen.getByText('Cuenta directiva').closest('tr');
    const filaCoordinador = screen.getByText('Cuenta coordinadora').closest('tr');
    expect(filaDirector?.textContent).toContain('Autoridad protegida');
    expect(filaDirector?.querySelector('button')).toBeNull();
    expect(filaCoordinador?.querySelectorAll('button').length).toBe(2);
    expect(await screen.findByRole('link', { name: 'Administración' })).toBeTruthy();
  });

  it('muestra errores de revocación en un aviso flotante junto al usuario',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>{
      if(url.includes('/cuenta/sesion'))return {perfil:{permisosInstitucionales:['AUTORIZACIONES_ADMINISTRAR']}};
      if(url.includes('/contexto'))return {direccion:{id:'1',codigo:'I',nombre:'Informática'},permisos:['AUTORIZACIONES_ADMINISTRAR']};
      if(url.includes('/catalogo'))return {roles:[{id_rol:'2',nombre:'Coordinación',descripcion:'',
        es_sistema:false,version_control:0,estado:'ACTIVO',permisos:[]}],permisos:[]};
      return {asignaciones:[{id:'10',tipo:'ROL',usuario_id:'2',destinatario:'Cuenta auxiliar',
        referencia_id:'2',referencia:'Coordinación',fecha_inicio:'2025-01-01T00:00:00Z',
        fecha_fin:null,fecha_revocacion:null}]};
    }})));
    render(<AutorizacionesPage/>);
    expect(await screen.findByText('Cuenta auxiliar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Revocar'}));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').className).toContain('admin-aviso-fijo');
  });
  it('no presenta operaciones administrativas cuando falla la autorización',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({message:'Acceso institucional no autorizado.'})}));
    render(<AutorizacionesPage/>);
    expect(await screen.findByRole('heading',{name:'Acceso restringido'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Crear rol'})).toBeNull();
  });
});
