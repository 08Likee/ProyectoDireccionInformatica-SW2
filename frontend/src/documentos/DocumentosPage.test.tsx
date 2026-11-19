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

// Estas pruebas verifican el contrato del visor y su seguridad en el DOM;
// la representación del PDF corresponde al navegador real, no a jsdom.
function simularVista(tipoMime='application/pdf',tipoRecibido=tipoMime,denegado=false) {
  const nombreOriginal=tipoMime==='image/png'?'imagen.png':'informe.pdf';
  const documento={id:'8',direccionId:'7',titulo:'Informe de prueba',categoria:'Institucional',descripcion:'',
    versionActual:1,versionControl:0,nombreArchivo:nombreOriginal,tipoMime,tamano:'100',fechaCreacion:'2026-11-18T00:00:00Z'};
  const version={id:'10',numeroVersion:1,nombreOriginal,tipoMime,tamanoBytes:'100',fechaCreacion:documento.fechaCreacion};
  const crearUrl=vi.fn(()=> 'blob:http://localhost/archivo-prueba');
  const revocarUrl=vi.fn();
  vi.stubGlobal('URL',class extends URL {
    static createObjectURL=crearUrl;
    static revokeObjectURL=revocarUrl;
  });
  const archivo=vi.fn(async()=>({ok:!denegado,json:async()=>({message:'Permiso insuficiente.'}),
    blob:async()=>new Blob(['contenido de prueba'],{type:tipoRecibido})}));
  const consultar=vi.fn(async(url:string)=>{
    if(url.includes('/archivo?'))return archivo();
    return {ok:true,json:async()=>{
      if(url.includes('/cuenta/sesion'))return {perfil:{permisosInstitucionales:['DOCUMENTOS_CONSULTAR']}};
      if(url.endsWith('/ambitos'))return {consulta:[{id:'7',codigo:'I',nombre:'Informática'}],gestion:[],limiteBytes:52428800,formatos:['PDF','PNG']};
      if(url.includes('/documentos?'))return {documentos:[documento],pagina:0,haySiguiente:false};
      if(url.includes('/documentos/8?'))return {documento,versiones:[version]};
      return {};
    }};
  });
  vi.stubGlobal('fetch',consultar);
  return {crearUrl,revocarUrl,consultar,nombreOriginal,archivo};
}

async function abrirVista() {
  render(<DocumentosPage/>);
  fireEvent.click(await screen.findByRole('button',{name:/Informe de prueba/}));
  fireEvent.click(await screen.findByRole('button',{name:'Vista previa'}));
}

describe('Vista previa autorizada de documentos',()=>{
  it('usa el visor nativo para PDF y permite abrir el mismo blob en otra pestaña',async()=>{
    const {crearUrl,revocarUrl,consultar}=simularVista();
    await abrirVista();
    const visor=await screen.findByTitle('Vista previa de informe.pdf');
    expect(visor.tagName).toBe('IFRAME');
    expect(visor.hasAttribute('sandbox')).toBe(false);
    expect(visor.getAttribute('src')).toBe('blob:http://localhost/archivo-prueba');
    expect(consultar).toHaveBeenCalledWith('/api/documentos/8/versiones/1/archivo?direccionId=7',
      {credentials:'same-origin',cache:'no-store'});
    expect(crearUrl).toHaveBeenCalledTimes(1);
    const enlace=screen.getByRole('link',{name:'abrir PDF en otra pestaña'});
    expect(enlace.getAttribute('href')).toBe(visor.getAttribute('src'));
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(screen.getByRole('button',{name:'Cerrar vista previa'}));
    expect(screen.queryByTitle('Vista previa de informe.pdf')).toBeNull();
    await waitFor(()=>expect(revocarUrl).toHaveBeenCalledWith('blob:http://localhost/archivo-prueba'));
  });
  it('mantiene las imágenes en su visor específico',async()=>{
    simularVista('image/png');
    await abrirVista();
    const imagen=await screen.findByRole('img',{name:'Vista previa de imagen.png'});
    expect(imagen.getAttribute('src')).toBe('blob:http://localhost/archivo-prueba');
    expect(screen.queryByRole('link',{name:'abrir PDF en otra pestaña'})).toBeNull();
  });
  it('rechaza contenido HTML inesperado aun cuando la metadata anuncie PDF',async()=>{
    const {crearUrl}=simularVista('application/pdf','text/html');
    await abrirVista();
    expect(await screen.findByText(/El tipo de archivo recibido no coincide/)).toBeTruthy();
    expect(screen.queryByTitle('Vista previa de informe.pdf')).toBeNull();
    expect(crearUrl).not.toHaveBeenCalled();
  });
  it('no crea un blob cuando el servidor deniega la recuperación',async()=>{
    const {crearUrl}=simularVista('application/pdf','application/pdf',true);
    await abrirVista();
    expect(await screen.findByText('Permiso insuficiente.')).toBeTruthy();
    expect(screen.queryByTitle('Vista previa de informe.pdf')).toBeNull();
    expect(crearUrl).not.toHaveBeenCalled();
  });
  it('descarta una respuesta tardía si el usuario cerró el detalle',async()=>{
    const {crearUrl,archivo}=simularVista();
    let resolver!:()=>void;
    archivo.mockImplementationOnce(async()=>{
      await new Promise<void>(resolve=>{resolver=resolve;});
      return {ok:true,json:async()=>({message:''}),blob:async()=>new Blob(['pdf'],{type:'application/pdf'})};
    });
    await abrirVista();
    await waitFor(()=>expect(archivo).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button',{name:'Cerrar detalle'}));
    resolver();
    // Esperar el restablecimiento de la acción, después de procesar la respuesta.
    fireEvent.click(screen.getByRole('button',{name:/Informe de prueba/}));
    const boton=await screen.findByRole('button',{name:'Vista previa'});
    await waitFor(()=>expect(boton.hasAttribute('disabled')).toBe(false));
    expect(crearUrl).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Vista previa de informe.pdf')).toBeNull();
  });
});
