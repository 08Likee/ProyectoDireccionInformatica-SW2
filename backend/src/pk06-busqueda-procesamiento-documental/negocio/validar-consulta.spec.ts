import { construirConsulta } from '../datos/consultas.repository';
import { validarConsulta } from './validar-consulta';
const base={direccionId:'1',fuente:'CORRESPONDENCIA'};
describe('CU-33 validación de filtros exactos',()=>{
  it('interpreta identificadores canónicos, texto normalizado y filtros combinados',()=>{
    expect(validarConsulta({...base,identificador:' cor-000012 ',referenciaOficial:' OF-  1 ',sentido:'RECIBIDA',remitenteId:'3',destinatarioId:'4'})).toMatchObject({pagina:0,filtros:{identificador:'12',referenciaOficial:'OF- 1',sentido:'RECIBIDA',remitenteId:'3',destinatarioId:'4'}});
    expect(validarConsulta({direccionId:'1',fuente:'EXPEDIENTES',identificador:'EXP-1000000',asunto:' Informe '})).toMatchObject({filtros:{identificador:'1000000',asunto:'Informe'}});
    expect(validarConsulta({...base,identificador:'COR-9223372036854775807'}).filtros.identificador).toBe('9223372036854775807');
  });
  it('rechaza fuentes, campos incompatibles, arreglos, identificadores y páginas incorrectos',()=>{
    for(const x of [{...base,fuente:'AUDITORIA'},{...base,titulo:'a'},{...base,identificador:'COR-000000'},{...base,identificador:'COR-0000001'},{...base,identificador:'COR-9223372036854775808'},{...base,remitenteId:['1','2']},{...base,pagina:'-1'},{...base,pagina:'100001'},{...base,pagina:'1.0'},{...base,sentido:'TODAS'}])expect(()=>validarConsulta(x)).toThrow();
  });
  it('valida fechas civiles inclusivas, UUID y tipos de actuación',()=>{
    expect(validarConsulta({...base,desde:'2024-02-29',hasta:'2024-02-29'}).filtros).toEqual({desde:'2024-02-29',hasta:'2024-02-29'});
    expect(()=>validarConsulta({...base,desde:'2026-02-29'})).toThrow();
    expect(()=>validarConsulta({...base,desde:'2026-03-02',hasta:'2026-03-01'})).toThrow();
    expect(()=>validarConsulta({direccionId:'1',fuente:'DOCUMENTOS',codigo:'UUID'})).toThrow();
    expect(()=>validarConsulta({direccionId:'1',fuente:'DOCUMENTOS',versionActual:'0'})).toThrow();
    expect(()=>validarConsulta({direccionId:'1',fuente:'ACTUACIONES',tipoMovimiento:'INVENTADO'})).toThrow();
  });
  it('parametriza valores literales sin comodines, SQL libre ni interpolación del usuario',()=>{
    const literal="x%' OR 1=1 --_",c=validarConsulta({direccionId:'1',fuente:'DOCUMENTOS',titulo:literal,categoria:'Prueba',pagina:'2'});
    const {sql,params}=construirConsulta(c,false);
    expect(sql).not.toContain(literal);expect(sql).not.toMatch(/ILIKE| LIKE /i);
    expect(sql).toContain('lower(btrim(d.titulo))=lower($3::text)');expect(sql).toContain('AND lower(btrim(d.categoria))=lower($4::text)');
    expect(params).toEqual(['1',false,literal,'Prueba',40]);
  });
  it('aplica ámbito y restricción al mismo conjunto de conteo y página y usa límites civiles de Bolivia',()=>{
    const c=validarConsulta({direccionId:'1',fuente:'DOCUMENTOS',desde:'2026-11-18',hasta:'2026-11-18'}),{sql,params}=construirConsulta(c,false);
    expect(sql).toContain('d.id_direccion=$1');expect(sql).toContain('NOT EXISTS(SELECT 1 FROM restriccion_documento');
    expect(sql).toContain("d.fecha_creacion>=(($3::date)::timestamp AT TIME ZONE 'America/La_Paz')");
    expect(sql).toContain("d.fecha_creacion<(($4::date + 1)::timestamp AT TIME ZONE 'America/La_Paz')");
    expect(sql).toContain('count(*)::text FROM filtrados');expect(sql).toContain('ORDER BY fecha DESC,orden_id DESC LIMIT 20');expect(params).toEqual(['1',false,'2026-11-18','2026-11-18',0]);
  });
});
