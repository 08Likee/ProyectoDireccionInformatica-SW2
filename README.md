# ProyectoDireccionInformatica — Dirección de Ingeniería Informática UAGRM

PATCH-000, entorno local de desarrollo; no es una beta funcional todavía.

## Windows / PowerShell

Requisitos: Git, Docker Desktop en modo contenedores Linux, Docker Compose v2, conexión a Internet. No se requiere instalar Java, Maven, Node ni PostgreSQL en Windows.

Desde la raíz, crear el secreto local una sola vez:

```powershell
Copy-Item .env.example .env
$secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
(Get-Content .env) -replace 'REEMPLAZAR_CON_SECRETO_LOCAL', $secret | Set-Content -Encoding ascii .env
docker compose config --quiet
docker compose run --rm --no-deps frontend npm install --package-lock-only --no-audit --no-fund
docker compose run --rm --no-deps frontend npm ci --no-audit --no-fund
docker compose run --rm backend mvn -B test
docker compose run --rm --no-deps frontend npm test
docker compose run --rm --no-deps frontend npm run build
docker compose up -d
```

Si cualquier comando devuelve error, detenerse y conservar la salida; no dar por cerrada la validación. Abrir http://localhost:5173 y pulsar Comprobar conexión cuando Spring Boot haya iniciado. Consultar `docker compose logs --tail=100 backend frontend` si aparece no disponible. Para detener sin borrar datos: `docker compose down`. No usar `down -v` si se desea conservar datos. No regenerar la contraseña después de inicializar PostgreSQL sin coordinar el cambio en la base.

Versionar `frontend/package-lock.json` generado localmente. Revisar `git status --short` antes de confirmar. `git add .` incluye el lock y excluye `.env`. Para generar Maven Wrapper posteriormente desde contenedor: `docker compose run --rm --no-deps backend mvn -B wrapper:wrapper -Dtype=only-script`.

El puerto de desarrollo solo escucha en 127.0.0.1. No publicar esta configuración en Internet; TLS, secretos gestionados, imagen de producción y cuenta de BD con mínimos privilegios se tratarán antes del despliegue. La cuenta PostgreSQL inicial es de desarrollo. La instalación inicial requiere red y todavía no dispone de lock npm hasta ejecutar el procedimiento. No se cambia el documento oficial.

Ver `docs/bitacora-implementacion.md` para decisiones y pendientes.
