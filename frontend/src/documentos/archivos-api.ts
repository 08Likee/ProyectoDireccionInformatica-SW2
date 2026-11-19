export async function solicitudArchivo(ruta:string,datos:FormData) {
  const csrf=await fetch('/api/cuenta/csrf',{credentials:'same-origin',cache:'no-store'});
  if (!csrf.ok) throw new Error('No se pudo verificar la protección de la solicitud.');
  const {csrfToken} = await csrf.json() as {csrfToken:string};
  const respuesta=await fetch(ruta,{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'x-csrf-token':csrfToken},body:datos});
  const contenido=await respuesta.json().catch(()=>({})) as {message?:string|string[];mensaje?:string;id?:string};
  if (respuesta.status===413) throw new Error('El archivo supera el límite de tamaño permitido.');
  if (!respuesta.ok) throw new Error(Array.isArray(contenido.message) ? contenido.message.join('. ')
    : contenido.message ?? 'No se pudo almacenar el documento.');
  return contenido;
}
