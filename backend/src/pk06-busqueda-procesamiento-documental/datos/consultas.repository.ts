import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConsultaValidada,Fuente,TAMANO_PAGINA } from '../negocio/validar-consulta';

const visual=(col:string,prefijo:string)=>`('${prefijo}-'||lpad(${col}::text,greatest(6,length(${col}::text)),'0'))`;
const cor=visual('c.id_correspondencia','COR'),exp=visual('e.id_expediente','EXP');
interface Definicion { from:string; ambito:string; id:string; codigo:string; titulo:string; resumen:string; fecha:string; civil:boolean; campos:Record<string,string> }
const DEFINICIONES:Record<Fuente,Definicion>={
  CORRESPONDENCIA:{from:'correspondencia c JOIN tipo_correspondencia t USING(id_tipo_correspondencia,id_direccion)',ambito:'c.id_direccion',id:'c.id_correspondencia',codigo:cor,titulo:'c.asunto',resumen:"concat_ws(' · ',c.sentido,t.nombre,c.referencia_oficial)",fecha:'c.fecha_comunicacion',civil:true,
    campos:{identificador:'c.id_correspondencia',referenciaOficial:"lower(regexp_replace(btrim(c.referencia_oficial),' +',' ','g'))",sentido:'c.sentido',tipoId:'c.id_tipo_correspondencia',periodoId:'c.id_periodo',remitenteId:'c.id_remitente',destinatarioId:'c.id_destinatario'}},
  DOCUMENTOS:{from:'documento d JOIN version_documento v ON v.id_documento=d.id_documento AND v.numero_version=d.version_actual',ambito:'d.id_direccion',id:'d.id_documento',codigo:'d.codigo::text',titulo:'d.titulo',resumen:"concat_ws(' · ',d.categoria,'Versión '||d.version_actual)",fecha:'d.fecha_creacion',civil:false,
    campos:{codigo:'d.codigo',titulo:'lower(btrim(d.titulo))',categoria:'lower(btrim(d.categoria))',versionActual:'d.version_actual'}},
  EXPEDIENTES:{from:'expediente e JOIN periodo_academico p USING(id_periodo,id_direccion)',ambito:'e.id_direccion',id:'e.id_expediente',codigo:exp,titulo:'e.asunto',resumen:"concat_ws(' · ',e.codigo,p.gestion||' — '||p.codigo_periodo)",fecha:'e.fecha_creacion',civil:false,
    campos:{identificador:'e.id_expediente',codigo:'lower(btrim(e.codigo))',asunto:'lower(btrim(e.asunto))',periodoId:'e.id_periodo'}},
  ACTUACIONES:{from:'movimiento_correspondencia m JOIN correspondencia c USING(id_correspondencia,id_direccion) JOIN tipo_movimiento_correspondencia t USING(id_tipo_movimiento)',ambito:'m.id_direccion',id:'m.id_movimiento',codigo:`${cor}||' / '||m.orden_registro`,titulo:'t.nombre',resumen:"concat_ws(' · ',c.asunto,m.nombre_responsable_registrado,m.nombre_destino_registrado)",fecha:'m.fecha_actuacion',civil:false,
    campos:{identificador:'m.id_correspondencia',tipoMovimiento:'t.codigo',responsableId:'m.id_responsable',destinoId:'m.id_destino'}},
};
export interface ResultadoConsulta {id:string;codigo:string;titulo:string;resumen:string;fecha:string}
/** Todas las expresiones SQL proceden de definiciones internas; ningún valor del usuario se concatena. */
export function construirConsulta(c:ConsultaValidada,restringidos:boolean){
  const d=DEFINICIONES[c.fuente],params:Array<string|number|boolean>=[c.direccionId],condiciones=[`${d.ambito}=$1`];
  if(c.fuente==='DOCUMENTOS'){
    params.push(restringidos);
    condiciones.push('($2::boolean OR NOT EXISTS(SELECT 1 FROM restriccion_documento r WHERE r.id_documento=d.id_documento AND r.fecha_revocacion IS NULL))');
  }
  for(const [k,v] of Object.entries(c.filtros)){
    const p=`$${params.push(v)}`;
    if(k==='desde'||k==='hasta'){
      if(d.civil)condiciones.push(`${d.fecha}${k==='desde'?'>=':'<='}${p}::date`);
      else condiciones.push(`${d.fecha}${k==='desde'?'>=':'<'}((${p}::date${k==='hasta'?' + 1':''})::timestamp AT TIME ZONE 'America/La_Paz')`);
    }else{
      const col=d.campos[k];if(!col)throw new Error('Filtro no validado.');
      condiciones.push(`${col}=${col.startsWith('lower(')?`lower(${p}::text)`:p}`);
    }
  }
  const offset=`$${params.push(c.pagina*TAMANO_PAGINA)}`;
  // Un único snapshot para página y total, incluso cuando OFFSET supera las coincidencias.
  const sql=`WITH filtrados AS (SELECT ${d.id} AS orden_id,${d.id}::text AS id,${d.codigo} AS codigo,${d.titulo} AS titulo,${d.resumen} AS resumen,${d.fecha} AS fecha
    FROM ${d.from} WHERE ${condiciones.join(' AND ')}), pagina AS (
    SELECT * FROM filtrados ORDER BY fecha DESC,orden_id DESC LIMIT ${TAMANO_PAGINA} OFFSET ${offset})
    SELECT (SELECT count(*)::text FROM filtrados) AS total,
    COALESCE((SELECT jsonb_agg(to_jsonb(p)-'orden_id' ORDER BY p.fecha DESC,p.orden_id DESC) FROM pagina p),'[]'::jsonb) AS registros`;
  return {sql,params};
}
@Injectable()
export class ConsultasRepository {
  constructor(private readonly db:DataSource){}
  async listar(c:ConsultaValidada,restringidos:boolean){
    const {sql,params}=construirConsulta(c,restringidos);
    const [r]=await this.db.query(sql,params) as Array<{total:string;registros:ResultadoConsulta[]}>;
    const total=Number(r.total);return {registros:r.registros,total,pagina:c.pagina,tamanoPagina:TAMANO_PAGINA,haySiguiente:(c.pagina+1)*TAMANO_PAGINA<total};
  }
  async origenMovimiento(id:string,direccion:string){
    const [r]=await this.db.query('SELECT id_correspondencia::text AS id FROM movimiento_correspondencia WHERE id_movimiento=$1 AND id_direccion=$2',[id,direccion]) as Array<{id:string}>;
    return r?.id??null;
  }
}
