# ProyectoDireccionInformatica

Sistema web de la Dirección de Ingeniería Informática — UAGRM. Base de desarrollo con frontend React + TypeScript, backend NestJS + TypeScript y PostgreSQL.

## Alcance de esta entrega

Infraestructura, landing institucional aprobada, prueba de salud real de backend + PostgreSQL, seguridad básica de cabeceras HTTP y denegación implícita de rutas inexistentes. **No** se implementó autenticación ni un caso de uso de negocio en este incremento. Los botones de acceso están deshabilitados intencionalmente. No se exponen términos de desarrollo en la interfaz.

## Ejecución con Docker Desktop en Windows

1. Crear `.env` a partir de `.env.example`. Generar una contraseña única. No compartirla ni subirla a Git.
2. Generar por primera vez los `package-lock.json` para frontend y backend con `npm install --package-lock-only` ejecutado mediante los contenedores Node.
3. Ejecutar `npm ci`, pruebas y compilaciones. Verificar `docker compose config --quiet`.
4. Iniciar con `docker compose up -d`; abrir http://127.0.0.1:5174. Comprobar `http://127.0.0.1:5174/api/health`.

El puerto 5174 evita conflicto con el proyecto anterior en 5173. El backend y PostgreSQL no publican puertos en el host. Los volúmenes son distintos de los de la instalación anterior; nunca usar `docker compose down -v` para limpiar sin copia y autorización.

### Comandos de referencia

```powershell
Copy-Item .env.example .env
$secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
(Get-Content .env) -replace 'REEMPLAZAR_CON_SECRETO_LOCAL', $secret | Set-Content -Encoding ascii .env
docker compose config --quiet
docker compose run --rm --no-deps backend npm install --package-lock-only --no-audit --no-fund
docker compose run --rm --no-deps frontend npm install --package-lock-only --no-audit --no-fund
docker compose run --rm --no-deps backend npm ci --no-audit --no-fund
docker compose run --rm --no-deps frontend npm ci --no-audit --no-fund
docker compose run --rm --no-deps backend npm test
docker compose run --rm --no-deps backend npm run build
docker compose run --rm --no-deps frontend npm test
docker compose run --rm --no-deps frontend npm run build
docker compose up -d
```

Las dependencias requieren conexión a npm al instalarse por primera vez. El lock generado debe versionarse. Si falla una prueba o instalación, revisar la salida y no declarar la etapa validada.

El backend no tiene endpoints de negocio en PATCH-000. Se agregarán mediante módulos por responsabilidad y migraciones TypeORM. La seguridad de acceso, cookies de sesión, CSRF y correo se implementarán y probarán en CU-01, no se presumirán existentes. Esta configuración de desarrollo no es para desplegar públicamente sin HTTPS, configuración de producción, secretos y endurecimiento adicional.
