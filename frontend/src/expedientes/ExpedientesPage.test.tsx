import { afterEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { ExpedientesPage } from './ExpedientesPage';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const direccion={id:'7',nombre:'Informática'},periodo={id:'2',gestion:2026,codigo:'II',fechaInicio:'2026-08-01',fechaFin:'2026-12-15'};
const expediente={id:'3',periodoId:'2',codigo:null,asunto:'Antecedentes institucionales',descripcion:'',versionControl:0,gestion:2026,codigoPeriodo:'II'};
function preparar(gestion:boolean,doc:boolean){
  const fetchMock=vi.fn(async(url:string,opciones?:RequestInit)=>({ok:true,json:async():Promise<unknown>=>{
    if(url.includes('/cuenta/csrf'))return {csrfToken:'prueba'};
    if(url.includes('/cuenta/sesion'))return {perfil:{permisosInstitucionales:['EXPEDIENTES_CONSULTAR']}};
    if(url.endsWith('/ambitos'))return {consulta:[direccion],gestion:gestion?[direccion]:[],periodos:gestion?[direccion]:[],documentos:doc?[direccion]:[],cargaDocumental:[]};
    if(url.includes('/periodos?'))return {periodos:[periodo]};
    if(url.includes('/expedientes/3/documentos?')&&opciones?.method==='POST')return {versionControl:1};
    if(url.includes('/expedientes/3?'))return {expediente,vinculos:[],consultaDocumental:doc};
    if(url.includes('/expedientes?'))return {expedientes:[expediente],haySiguiente:false};
    if(url.includes('/documentos?'))return {documentos:[{id:'9',titulo:'Informe vigente',versionActual:2,versionControl:1}],haySiguiente:false};
    if(url.includes('/documentos/9?'))return {documento:{id:'9',titulo:'Informe vigente',versionActual:2,versionControl:1},versiones:[{numeroVersion:2,nombreOriginal:'informe.pdf'},{numeroVersion:1,nombreOriginal:'anterior.pdf'}]};
    return {};
  }}));
  vi.stubGlobal('fetch',fetchMock);return fetchMock;
}
describe('CU-08 interfaz de expedientes',()=>{
  it('presenta el expediente vacío sin inventar antecedentes y permite consulta sin permiso documental',async()=>{
    preparar(false,false);render(<ExpedientesPage/>);
    fireEvent.click(await screen.findByRole('button',{name:/Antecedentes institucionales/}));
    expect(await screen.findByText('Tu permiso no incluye consulta documental.')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Crear expediente'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Incorporar antecedente'})).toBeNull();
  });
  it('selecciona por defecto la versión vigente fijada y permite seguir dinámicamente el documento',async()=>{
    const fetchMock=preparar(true,true);vi.spyOn(window,'confirm').mockReturnValue(true);render(<ExpedientesPage/>);
    fireEvent.click(await screen.findByRole('button',{name:/Antecedentes institucionales/}));
    expect(await screen.findByText('No hay antecedentes accesibles.')).toBeTruthy();
    const selector=await screen.findByLabelText('Documento');
    await screen.findByRole('option',{name:'Informe vigente'});fireEvent.change(selector,{target:{value:'9'}});
    const versiones=await screen.findByLabelText('Tipo de vínculo y versión') as HTMLSelectElement;
    expect(versiones.value).toBe('2');fireEvent.change(versiones,{target:{value:'dinamica'}});
    fireEvent.click(screen.getByRole('button',{name:'Incorporar antecedente'}));
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/expedientes/3/documentos?direccionId=7',expect.objectContaining({method:'POST',body:JSON.stringify({documentoId:'9',versionDocumento:1,versionControl:0,versionFijada:null,obligatorio:false,observacion:''})})));
    expect(await screen.findByText('Antecedente incorporado.')).toBeTruthy();
  });
  it('no ofrece funciones privadas ante una denegación del servidor',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({message:'Permiso insuficiente.'})})));
    render(<ExpedientesPage/>);expect(await screen.findByRole('heading',{name:'Acceso restringido'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Crear expediente'})).toBeNull();
  });
});
