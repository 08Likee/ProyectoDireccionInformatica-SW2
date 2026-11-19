import { validarArchivo, textoDocumento, idDocumento, TAMANO_MAXIMO_ARCHIVO } from './validar-archivo';

function archivo(nombre:string,buffer:Buffer){return {originalname:nombre,buffer,size:buffer.length};}

describe('CU-07: validación de archivos y metadatos',()=>{
  it('publica el límite de carga configurado (50 MB por defecto)',()=>{
    expect(TAMANO_MAXIMO_ARCHIVO).toBe(Number(process.env.DOCUMENTOS_MAX_MB ?? 50)*1024*1024);
  });
  it('acepta PDF real y limpia la ruta enviada por el usuario',()=>{
    const validado=validarArchivo(archivo('C:\\archivos\\resolucion.pdf',Buffer.from('%PDF-1.7\narchivo\n%%EOF')));
    expect(validado.nombre).toBe('resolucion.pdf');
    expect(validado.tipoMime).toBe('application/pdf');
  });
  it('rechaza un ejecutable disfrazado, contenido incompleto y exceso de tamaño',()=>{
    expect(()=>validarArchivo(archivo('tramite.pdf',Buffer.from('MZ-exe')))).toThrow();
    expect(()=>validarArchivo({originalname:'prueba.csv',buffer:Buffer.from('a'),size:2})).toThrow();
    expect(()=>validarArchivo({originalname:'prueba.pdf',buffer:Buffer.from('%PDF-'),size:TAMANO_MAXIMO_ARCHIVO+1})).toThrow();
    expect(()=>validarArchivo(undefined)).toThrow();
  });
  it('rechaza nombre peligroso y caracteres de control',()=>{
    expect(()=>validarArchivo(archivo('bad\nname.csv',Buffer.from('a,b\n1,2')))).toThrow();
    expect(()=>validarArchivo(archivo('texto.csv',Buffer.from([0,1,2,3])))).toThrow();
    expect(()=>textoDocumento('a\nsecret','Título',160)).toThrow();
  });
  it('verifica UTF-8 en CSV y controles de identificador',()=>{
    expect(validarArchivo(archivo('datos.csv',Buffer.from('columna,valor\n1,á'))).tipoMime).toBe('text/csv');
    expect(()=>validarArchivo(archivo('datos.csv',Buffer.from([0xff,0xfe])))).toThrow();
    expect(idDocumento('27')).toBe('27');
    expect(()=>idDocumento('27 OR 1=1')).toThrow();
    expect(()=>idDocumento('9223372036854775808')).toThrow();
  });
});
