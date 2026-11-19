import { afterEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { ConsultasPage } from './ConsultasPage';
import { NavegacionInstitucional } from '../navegacion/NavegacionInstitucional';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const ambitos=[{id:'7',nombre:'Dirección A',fuentes:['CORRESPONDENCIA','DOCUMENTOS']},{id:'9',nombre:'Dirección B',fuentes:['EXPEDIENTES']}];
const registro={id:'42',codigo:'COR-000042',titulo:'Solicitud de prueba',resumen:'RECIBIDA · Oficio',fecha:'2026-11-19'};
function preparar(opciones:{sinAcceso?:boolean;revocado?:boolean;vacio?:boolean}={}){
  const responder=vi.fn(async(url:string)=>{
    const ruta=url.split('?')[0];const p=new URLSearchParams(url.split('?')[1]);let cuerpo:unknown;let ok=true;
    if(ruta==='/api/consultas/ambitos')cuerpo={ambitos:opciones.sinAcceso?[]:ambitos};
    else if(ruta==='/api/consultas/catalogos')cuerpo={tipos:[{id:'3',codigo:'OF',nombre:'Oficio'}],periodos:[],interlocutores:[]};
    else if(ruta==='/api/consultas/registros')cuerpo={registros:opciones.vacio||p.get('pagina')==='1'?[]:[registro],total:opciones.vacio?0:21,pagina:Number(p.get('pagina')),tamanoPagina:20,haySiguiente:!opciones.vacio&&p.get('pagina')!=='1'};
    else if(ruta==='/api/consultas/CORRESPONDENCIA/42'){ok=!opciones.revocado;cuerpo=ok?{correspondencia:{id:'42',asunto:'Solicitud de prueba',sentido:'RECIBIDA'},documentos:[],expedientes:[]}:{message:'Permiso revocado'};}
    else cuerpo={perfil:{permisosInstitucionales:[]}};
    return {ok,json:async()=>cuerpo};
  });vi.stubGlobal('fetch',responder);return responder;
}
const buscar=()=>fireEvent.click(screen.getByRole('button',{name:'Consultar registros'}));
describe('CU-33 interfaz de consulta convencional',()=>{
  it('limita las fuentes por Dirección y oculta navegación si no hay ámbito efectivo',async()=>{
    preparar();render(<ConsultasPage/>);await screen.findByRole('button',{name:'Consultar registros'});
    expect(await screen.findByRole('link',{name:'Consultas'})).toBeTruthy();expect(screen.queryByRole('option',{name:'Expedientes'})).toBeNull();
    fireEvent.change(screen.getByLabelText('Dirección institucional'),{target:{value:'9'}});expect(await screen.findByLabelText('Identificador EXP')).toBeTruthy();expect(screen.queryByRole('option',{name:'Correspondencia'})).toBeNull();
    cleanup();preparar({sinAcceso:true});render(<ConsultasPage/>);expect(await screen.findByText('Sin fuentes autorizadas')).toBeTruthy();expect(screen.queryByRole('link',{name:'Consultas'})).toBeNull();expect(screen.queryByRole('button',{name:'Consultar registros'})).toBeNull();
  });
  it('envía filtros exactos combinados, conserva los aplicados al paginar y limpia al cambiar fuente',async()=>{
    const f=preparar();render(<ConsultasPage/>);await screen.findByLabelText('Referencia oficial');
    fireEvent.change(screen.getByLabelText('Referencia oficial'),{target:{value:'OF-1'}});fireEvent.change(screen.getByLabelText('Sentido'),{target:{value:'RECIBIDA'}});buscar();
    expect(await screen.findByText(/21 coincidencias autorizadas/)).toBeTruthy();
    expect(f).toHaveBeenCalledWith(expect.stringContaining('referenciaOficial=OF-1&sentido=RECIBIDA'),expect.objectContaining({method:'GET'}));
    fireEvent.change(screen.getByLabelText('Referencia oficial'),{target:{value:'OF-2'}});fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));
    await waitFor(()=>expect(f).toHaveBeenCalledWith(expect.stringMatching(/pagina=1.*referenciaOficial=OF-1/),expect.objectContaining({method:'GET'})));
    fireEvent.change(screen.getByLabelText('Fuente de información'),{target:{value:'DOCUMENTOS'}});expect(await screen.findByLabelText('Título exacto')).toBeTruthy();expect(screen.queryByText(/21 coincidencias/)).toBeNull();expect(screen.queryByLabelText('Referencia oficial')).toBeNull();
  });
  it('consulta nuevamente el detalle, muestra solo lectura y no conserva datos cuando se revoca',async()=>{
    const f=preparar();render(<ConsultasPage/>);await screen.findByRole('button',{name:'Consultar registros'});buscar();fireEvent.click(await screen.findByRole('button',{name:/Solicitud de prueba/}));
    const panel=await screen.findByRole('region',{name:'Detalle autorizado'});expect(within(panel).getByText('Solicitud de prueba')).toBeTruthy();expect(within(panel).queryByText('Rectificar datos')).toBeNull();expect(f).toHaveBeenCalledWith('/api/consultas/CORRESPONDENCIA/42?direccionId=7',expect.objectContaining({method:'GET'}));
    cleanup();preparar({revocado:true});render(<ConsultasPage/>);await screen.findByRole('button',{name:'Consultar registros'});buscar();fireEvent.click(await screen.findByRole('button',{name:/Solicitud de prueba/}));expect((await screen.findByRole('alert')).textContent).toContain('Permiso revocado');expect(screen.queryByRole('region',{name:'Detalle autorizado'})).toBeNull();expect(screen.queryByText('Solicitud de prueba')).toBeNull();
  });
  it('presenta resultado vacío sin tratarlo como error',async()=>{
    preparar({vacio:true});render(<ConsultasPage/>);await screen.findByRole('button',{name:'Consultar registros'});buscar();expect(await screen.findByText(/0 coincidencias autorizadas/)).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();
  });
  it('muestra el enlace institucional solo con una fuente efectiva',async()=>{
    preparar({sinAcceso:true});render(<NavegacionInstitucional/>);await waitFor(()=>expect(screen.queryByRole('link',{name:'Consultas'})).toBeNull());cleanup();preparar();render(<NavegacionInstitucional/>);expect((await screen.findByRole('link',{name:'Consultas'})).getAttribute('href')).toBe('/consultas');
  });
});
