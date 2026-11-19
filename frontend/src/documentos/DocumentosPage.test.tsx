import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentosPage } from './DocumentosPage';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('Gestión documental institucional',()=>{
  it('presenta archivos existentes y acciones permitidas por la Dirección',async()=>{
    const fetchSimulado=vi.fn(async(url:string)=>({ok:true,json:async()=>{
      if(url.includes('/api/cuenta/sesion'))return {perfil:{permisosInstitucionales:['DOCUMENTOS_GESTIONAR','DOCUMENTOS_CONSULTAR']}};
      if(url.endsWith('/ambitos'))return {consulta:[{id:'7',codigo:'INFORMATICA',nombre:'Dirección de Ingeniería Informática'}],
        gestion:[{id:'7',codigo:'INFORMATICA',nombre:'Dirección de Ingeniería Informática'}],
        limiteBytes:52428800,formatos:['PDF']};
      if(url.includes('/api/documentos?'))return {documentos:[{id:'8',direccionId:'7',titulo:'Memorando institucional',
        categoria:'Memorandos',descripcion:'',versionActual:1,versionControl:0,nombreArchivo:'memo.pdf',
        tipoMime:'application/pdf',tamano:'100',fechaCreacion:'2026-11-18T00:00:00Z'}],pagina:0,haySiguiente:false};
      return {};
    }}));
    vi.stubGlobal('fetch',fetchSimulado);
    render(<DocumentosPage/>);
    expect(await screen.findByRole('heading',{name:'Documentos digitales'})).toBeTruthy();
    expect(await screen.findByText('Memorando institucional')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Incorporar documento'})).toBeTruthy();
    expect(screen.getByText(/Tamaño máximo: 50 MB/)).toBeTruthy();
    expect(screen.getByRole('button',{name:'Guardar documento'}).hasAttribute('disabled')).toBe(true);
    expect((await screen.findByRole('link',{name:'Documentos'})).getAttribute('href')).toBe('/documentos');
    await waitFor(()=>expect(fetchSimulado).toHaveBeenCalledWith(expect.stringContaining('direccionId=7'),
      expect.objectContaining({credentials:'same-origin'})));
    expect(document.body.textContent).not.toMatch(/prototipo|CU-07|beta/i);
  });
  it('anuncia la búsqueda y enfoca los resultados después de consultar al servidor',async()=>{
    const consultar=vi.fn(async(url:string)=>({ok:true,json:async()=>{
      if(url.includes('/cuenta/sesion'))return {perfil:{permisosInstitucionales:['DOCUMENTOS_CONSULTAR']}};
      if(url.endsWith('/ambitos'))return {consulta:[{id:'7',codigo:'I',nombre:'Informática'}],gestion:[],
        limiteBytes:52428800,formatos:['PDF']};
      return {documentos:[{id:'3',direccionId:'7',titulo:'Informe 2026',categoria:'Institucional',
        descripcion:'',versionActual:1,versionControl:0,nombreArchivo:'informe.pdf',tipoMime:'application/pdf',
        tamano:'100',fechaCreacion:'2026-11-18T00:00:00Z'}],pagina:0,haySiguiente:false};
    }}));
    vi.stubGlobal('fetch',consultar);
    const mover=vi.fn();
    Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:mover});
    try {
      render(<DocumentosPage/>);
      expect(await screen.findByText('Informe 2026')).toBeTruthy();
      fireEvent.change(screen.getByPlaceholderText('Buscar por título o categoría'),{target:{value:'Informe'}});
      fireEvent.click(screen.getByRole('button',{name:'Buscar'}));
      await waitFor(()=>expect(consultar).toHaveBeenCalledWith(expect.stringContaining('busqueda=Informe'),expect.anything()));
      await waitFor(()=>expect(mover).toHaveBeenCalled());
      expect(screen.getByRole('region',{name:'Resultados de documentos'})).toBe(document.activeElement);
      expect(screen.getByText('1 documento encontrado en esta página.')).toBeTruthy();
    } finally { delete (HTMLElement.prototype as {scrollIntoView?:unknown}).scrollIntoView; }
  });
  it('oculta acciones de escritura para una cuenta de solo consulta',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>{
      if(url.includes('/api/cuenta/sesion'))return {perfil:{permisosInstitucionales:['DOCUMENTOS_CONSULTAR']}};
      if(url.endsWith('/ambitos'))return {consulta:[{id:'9',codigo:'D',nombre:'Otra Dirección'}],gestion:[],limiteBytes:52428800,formatos:['PDF']};
      return {documentos:[],pagina:0,haySiguiente:false};
    }})));
    render(<DocumentosPage/>);
    expect(await screen.findByRole('heading',{name:'Buscar documentos'})).toBeTruthy();
    expect(screen.queryByRole('heading',{name:'Incorporar documento'})).toBeNull();
  });
  it('no muestra información documental si el servidor deniega acceso',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({message:'Permiso insuficiente.'})})));
    render(<DocumentosPage/>);
    expect(await screen.findByRole('heading',{name:'Acceso restringido'})).toBeTruthy();
    expect(screen.queryByRole('heading',{name:'Incorporar documento'})).toBeNull();
  });
});
