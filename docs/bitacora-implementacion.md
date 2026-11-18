# Bitácora de implementación

## PATCH-000 — Inicialización técnica

Estado: entregado para validación local; no cerrado. No corresponde a un caso de uso oficial.

- Repositorio único, backend Spring Boot 4.0.8 / Java 21, frontend React/TypeScript/Vite/Tailwind y PostgreSQL 17.
- Docker Compose de desarrollo; únicamente el frontend expuesto en loopback. Sin credenciales por defecto utilizables; generar secreto local. No es un despliegue de producción.
- Seguridad inicial: denegación por defecto, sin login de muestra; solo GET /actuator/health público sin detalles. CU-01 definirá autenticación y sesiones. No se implementa aún RBAC.
- V1 registra inicio de Flyway sin tablas de negocio; Hibernate valida esquema. Se revisará el modelo de datos caso por caso. Sin cambios en ERS ni en casos de uso.
- Identidad visual: escudo suministrado, redimensionado conservando proporción, y colores celeste/blanco. Landing pública responsive rediseñada con mayor riqueza visual, hero institucional, tarjetas de servicios, novedades y bloque de acceso, manteniendo la seriedad institucional. Inicio de sesión y registro deshabilitados hasta CU-01.
- Pruebas previstas: tres pruebas de infraestructura (salud, protección, migración) y tres de interfaz (estado disponible, acceso deshabilitado y fallo/reintento).
- Decisión: Maven en Docker sustituye por ahora Maven Wrapper; generar lock npm en primera instalación y versionarlo. No se incluyen FastAPI, RPA, Swagger, Testcontainers, iconografía ni Playwright hasta que sean necesarios.
- Verificación realizada: comprobación de aplicación del patch en Git vacío, revisión estática de manifiestos. No se pudieron descargar dependencias ni ejecutar Docker en el entorno de generación.
- Pendiente: ejecutar `docker compose run --rm backend mvn -B test`, pruebas y build frontend, verificar interfaz y registrar resultados. No iniciar CU-01 hasta cerrar esta validación.

- Revisión de nomenclatura: ProyectoDireccionInformatica, Compose direccion-informatica, PostgreSQL direccion_informatica, paquete Java bo.edu.uagrm.informatica.direccion. Sustituye íntegramente al PATCH-000 anterior, no es un parche incremental sobre él.
- Entorno del usuario: Windows, Git y Docker Engine verificados mediante hello-world.

- Ajuste visual posterior: la landing se enriqueció para evitar una interfaz demasiado sobria, tomando como referencia información pública oficial de la FICCT/UAGRM (unidad académica, creación de la carrera, contacto y contexto institucional).

## PATCH-000-C01 — Corrección de contraste

- Defecto observado en la validación local: fondo azul fijo de 460 px y texto blanco sobre fondo claro.
- Se asigna un fondo azul oscuro al encabezado y un degradado opaco a toda la sección principal, cuya altura depende del contenido; se conserva la cuadrícula responsive.
- Sin cambios en backend, datos, dependencias ni casos de uso.
- Pendiente: verificar visualmente en escritorio, móvil y zoom, ejecutar pruebas frontend y compilación.

## PATCH-000-C02 — Contraste e identidad pública

- Fondo CSS explícito y opaco sobre toda la sección principal; sin altura fija.
- Se eliminan referencias públicas a beta, prototipo, códigos CU/PK y planificación interna. Se conserva el aviso real de acceso no habilitado.
- Pruebas frontend actualizadas y prueba de regresión de textos internos y clase del fondo.
- Sin cambios de backend, dependencias ni datos. Pendiente ejecución local y comprobación visual tras reiniciar Vite.
