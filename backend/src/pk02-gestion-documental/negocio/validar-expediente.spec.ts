import { control,validarExpediente,validarPeriodo } from './validar-expediente';
describe('Validación CU-08',()=>{
  const periodo={direccionId:'1',gestion:2026,codigo:'II',fechaInicio:'2026-08-01',fechaFin:'2026-12-15'};
  const expediente={direccionId:'1',periodoId:'2',asunto:'Antecedente',codigo:'',descripcion:''};
  it('acepta fechas civiles reales y no inventa periodos',()=>expect(validarPeriodo(periodo)).toMatchObject({gestion:2026,codigo:'II',inicio:'2026-08-01'}));
  it('rechaza fechas imposibles e invertidas',()=>{expect(()=>validarPeriodo({...periodo,fechaInicio:'2026-02-30'})).toThrow();expect(()=>validarPeriodo({...periodo,fechaFin:'2026-01-01'})).toThrow();});
  it('admite código opcional y exige asunto y referencias',()=>{expect(validarExpediente(expediente,true).codigo).toBeNull();expect(()=>validarExpediente({...expediente,asunto:' '},true)).toThrow();expect(()=>validarExpediente({...expediente,periodoId:'0'},true)).toThrow();});
  it('rechaza campos adicionales y versiones inválidas',()=>{expect(()=>validarExpediente({...expediente,otro:'x'},true)).toThrow();expect(()=>control(-1)).toThrow();expect(()=>control('1')).toThrow();expect(control(0)).toBe(0);});
});
