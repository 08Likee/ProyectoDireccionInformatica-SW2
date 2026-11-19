# ProyectoDireccionInformatica

Sistema web de la Dirección de Ingeniería Informática — UAGRM. Base de desarrollo con frontend React + TypeScript, backend NestJS + TypeScript y PostgreSQL.

## Alcance actual

Infraestructura React + NestJS, landing institucional, consulta de salud PostgreSQL y
CU-01 (gestión de cuenta y acceso) incorporado. La aprobación funcional de CU-01 queda
pendiente de pruebas automatizadas y manuales en el entorno del proyecto.

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

El PATCH-000 estableció la base y el PATCH-001 incorpora el CU-01. Esta configuración de desarrollo no debe publicarse sin HTTPS, configuración de producción, secretos y endurecimiento adicional.

## CU-01 — Cuenta y acceso (PK01)

El módulo `backend/src/pk01-gestion-usuarios-seguridad/` separa `presentacion`, `negocio` y `datos`.
Utiliza las tablas `usuario`, `sesion` y `comprobante_cuenta` del diseño oficial de SW2.
Las migraciones TypeORM se aplican al iniciar NestJS (`synchronize: false`); no se requiere
recrear el volumen PostgreSQL. Los comprobantes y las sesiones se almacenan como hashes.

Antes de iniciar esta versión, actualizar el lockfile y las dependencias backend:

```powershell
# Dentro de la carpeta del proyecto
# Primero en Docker, para regenerar backend/package-lock.json según package.json
docker compose run --rm --no-deps backend npm install --no-audit --no-fund
docker compose up -d --force-recreate backend frontend mailpit
```

Pruebas automatizadas:

```powershell
docker compose exec backend npm test
docker compose exec backend npm run build
docker compose exec backend npm run lint
docker compose exec backend npm run test:integration
docker compose exec frontend npm test
docker compose exec frontend npm run build
```

- Portal: `http://127.0.0.1:5174/`
- Registro: `http://127.0.0.1:5174/registro`
- Inicio de sesión: `http://127.0.0.1:5174/login`
- Correo de desarrollo: `http://127.0.0.1:8026/` (Mailpit, **no Gmail real**).
- El correo real se configura mediante `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
  `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` en `.env`.
- No publicar la interfaz de Mailpit en Internet ni subir `.env` al repositorio.
- La política de contraseña exige un mínimo de 15 caracteres y cuatro clases.
- Sesiones de navegador mediante cookie HttpOnly/SameSite=Strict (Secure en producción),
  verificación CSRF de doble envío, hashes scrypt y tokens de un solo uso.
- El limitador de intentos incluido es **por proceso** (una instancia NestJS); antes de
  escalar horizontalmente deberá migrarse a almacenamiento compartido.
- HTTPS y SMTP institucional deben configurarse antes del despliegue público.
- Las pruebas de integración usan un servicio de correo simulado, PostgreSQL real y
  eliminan únicamente la cuenta temporal creada por el propio test.

## Repositorio documental institucional (CU-07)

La gestión documental utiliza PostgreSQL para metadatos, versiones y auditoría y un **volumen
privado persistente de Docker** para los archivos. Los bytes **no** se almacenan bajo `frontend`,
`public`, ni en una carpeta servida por HTTP. No se publican URLs físicas: toda recuperación
se valida en NestJS mediante permisos vigentes y ámbito institucional.

Al agregar CU-07, **recrear** el contenedor backend (no basta `docker compose restart`) para
montar el volumen `documentos_nest_data`:

```powershell
docker compose up -d --force-recreate backend frontend
```

No ejecutar `docker compose down -v`: eliminaría también los volúmenes de PostgreSQL y documentos.
Respaldar **tanto** la base PostgreSQL **como** `documentos_nest_data` antes de migrar o restaurar,
ya que se necesitan ambos para conservar referencias consistentes.

Parámetros **técnicos provisionales**, sujetos a validación institucional: PDF, DOCX, XLSX,
CSV UTF-8, JPG/JPEG y PNG; 10 MiB por archivo. Se verifica el tipo mediante firma/estructura
básica, tamaño, hash SHA-256, vigencia de permisos y ubicación institucional. Esto **no**
sustituye un análisis antivirus formal para despliegues institucionales.

La creación documental admite registros sin expediente asociado. Las vinculaciones con
expedientes, correspondencia y trámites se integrarán cuando esos registros existan y puedan
validarse mediante sus respectivas claves foráneas y permisos; **no se simulan destinos**.
No se ha implementado eliminación definitiva de documentos, para no destruir antecedentes.

Pruebas: `docker compose exec backend npm test`, `npm run test:integration`, `npm run build`,
`npm run lint`; y `docker compose exec frontend npm test`, `npm run build`.
