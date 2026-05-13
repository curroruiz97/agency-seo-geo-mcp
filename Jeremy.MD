# Jeremy.MD

# Guia paso a paso para continuar el proyecto Agency SEO/GEO MCP

Este documento esta escrito para seguir el proyecto desde el punto exacto en el que queda ahora. La idea es que puedas avanzar aunque no controles mucho de IA, MCP, Docker o bases de datos.

## 1. Que tenemos ahora mismo

Ya existe un repositorio con un primer servidor MCP para una agencia SEO/GEO.

El servidor MCP es una pieza intermedia:

```text
ChatGPT
  -> llama herramientas MCP
  -> nuestro servidor MCP
  -> en el futuro consulta Supabase, WordPress, Rank Math y SE Ranking
```

Ahora mismo el proyecto esta en version `0.2.0`.

Ya funciona:

- Servidor Node.js + TypeScript.
- Endpoint de salud: `/health`.
- Endpoint de preparacion: `/ready`.
- Endpoint de version: `/version`.
- Endpoint MCP: `/mcp`.
- Docker Compose.
- Roadmap profesional.
- Arquitectura preparada para crecer.
- Prisma preparado para usar Supabase como base de datos.
- CI en GitHub Actions.
- Tests, lint, typecheck y build.

Todavia NO tenemos:

- Datos reales en base de datos.
- Conexion real a Supabase.
- Conexion real a WordPress.
- Conexion real a SE Ranking.
- Conexion real a Rank Math.
- Herramientas de escritura.
- Publicacion automatica.

Esto es intencionado. Primero se esta construyendo una base segura.

## 2. Arquitectura recomendada

La arquitectura decidida es:

```text
ChatGPT
  -> https://mcp.tudominio.com/mcp
  -> VPS IONOS con Docker y Caddy
  -> Servidor Agency SEO/GEO MCP
  -> Supabase Cloud Postgres
  -> WordPress / Rank Math / SE Ranking
```

La razon es simple:

- El VPS ejecuta el servidor MCP.
- Supabase gestiona la base de datos.
- Tus webs WordPress siguen separadas.

Esto evita cargar tu VPS, donde ya tienes webs, con toda la responsabilidad de Postgres, backups, actualizaciones y restauracion.

## 3. Reglas importantes antes de seguir

No subas nunca a GitHub:

- `.env`
- contrasenas
- tokens
- Application Passwords de WordPress
- claves de Supabase
- claves de SE Ranking

El archivo `.env.example` si se sube, porque solo contiene nombres de variables, no secretos reales.

Mantener siempre al principio:

```env
READ_ONLY_MODE=true
```

Mientras esto este en `true`, el sistema debe comportarse como solo lectura.

## 4. Comandos basicos en local

Entrar en la carpeta:

```bash
cd "C:\Users\Usuario\Desktop\MCP Avenue"
```

Instalar dependencias:

```bash
npm install
```

Ejecutar todos los checks:

```bash
npm run check
```

Esto ejecuta:

```text
lint
typecheck
tests
build
```

Arrancar con Docker:

```bash
docker compose up -d --build
```

Comprobar que funciona:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/version
```

Parar Docker:

```bash
docker compose down
```

## 5. Estado esperado ahora

Si todo va bien:

```text
/health  -> status ok
/ready   -> status ready, database not_configured
/version -> version 0.2.0
```

`database not_configured` es normal ahora mismo. Significa que todavia no has conectado Supabase.

## 6. Crear cuenta y proyecto en Supabase

Puedes empezar con Supabase Free.

Pasos:

1. Entra en Supabase.
2. Crea una cuenta.
3. Crea un nuevo proyecto.
4. Elige una region europea si tus clientes son principalmente de Espana o Europa.
5. Guarda la password de la base de datos en un gestor de contrasenas.

Supabase Free sirve para:

- desarrollo,
- pruebas,
- 3 proyectos piloto,
- validar la arquitectura.

Antes de usar datos reales de clientes en produccion, es mejor pasar a Supabase Pro.

## 7. Conseguir las URLs de conexion de Supabase

En Supabase:

1. Abre tu proyecto.
2. Ve a `Project Settings`.
3. Ve a `Database`.
4. Busca `Connection string`.

Vas a necesitar dos URLs:

### DATABASE_URL

Esta sera la URL normal que usara el servidor MCP para conectarse a la base de datos.

Recomendacion:

- usar el pooler de Supabase si el VPS solo tiene IPv4,
- o la conexion directa si tu VPS soporta IPv6 correctamente.

### DIRECT_URL

Esta se usa para migraciones de Prisma.

Si no tienes claro cual usar, empieza con el pooler para `DATABASE_URL` y revisa la documentacion de Supabase para la directa.

## 8. Crear el archivo .env local

Ya he dejado creado un archivo local:

```text
C:\Users\Usuario\Desktop\MCP Avenue\.env
```

Ese archivo NO se sube a GitHub. Esta ignorado por seguridad.

Dentro veras estas dos lineas:

```env
DATABASE_URL=postgresql://postgres.bfidzlbmkpegnndijosw:REPLACE_WITH_SUPABASE_DB_PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.bfidzlbmkpegnndijosw:REPLACE_WITH_SUPABASE_DB_PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

Solo tienes que sustituir:

```text
REPLACE_WITH_SUPABASE_DB_PASSWORD
```

por la password real de la base de datos de Supabase.

No borres el resto de la URL.
No pongas espacios.
No subas ese archivo a GitHub.

En local, copia:

```bash
copy .env.example .env
```

Edita `.env`.

Ejemplo para desarrollo:

```env
NODE_ENV=development
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
READ_ONLY_MODE=true
ALLOWED_ORIGINS=
REQUIRE_MCP_AUTH=false
MCP_BEARER_TOKEN=
LOG_LEVEL=info
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
```

Importante:

- En local puedes usar `REQUIRE_MCP_AUTH=false`.
- En VPS publico no conviene dejar `/mcp` abierto si hay datos reales.

## 9. Generar Prisma Client

Cuando hayas puesto `DATABASE_URL` y `DIRECT_URL`, ejecuta:

```bash
npm run db:generate
```

Esto no crea tablas. Solo genera el cliente interno de Prisma.

## 10. Crear la primera migracion real

Cuando Supabase este conectado, el siguiente paso de desarrollo sera crear la migracion inicial.

Comando:

```bash
npm run db:migrate -- --name init_project_registry
```

Esto deberia crear las tablas definidas en:

```text
prisma/schema.prisma
```

Tablas principales:

- clients
- projects
- project_capabilities
- project_credentials
- opportunities
- change_requests
- action_logs
- reports

## 11. Comprobar tablas en Supabase

Despues de migrar:

1. Ve al dashboard de Supabase.
2. Abre `Table Editor`.
3. Comprueba que aparecen las tablas.
4. No metas aun credenciales reales a mano.

## 12. Seed de proyectos piloto

El siguiente desarrollo recomendado es crear un seed.

Objetivo:

- insertar 3 clientes de prueba,
- insertar 3 proyectos de prueba,
- insertar capacidades por proyecto,
- mantener todo en read-only.

Comando futuro recomendado:

```bash
npm run db:seed
```

Este script todavia no esta creado. Hay que implementarlo en la siguiente fase.

## 13. Cambiar list_projects de mock a Supabase

Ahora `list_projects` usa datos mock.

El siguiente paso de codigo es:

1. Crear un repositorio Prisma para proyectos.
2. Leer proyectos desde Supabase.
3. Mantener un fallback mock solo en desarrollo si se desea.
4. En produccion, no usar mock.

Resultado esperado:

```text
ChatGPT llama list_projects
  -> MCP server
  -> Supabase
  -> devuelve proyectos reales sin credenciales
```

## 14. Usar Supabase MCP con cuidado

Supabase tiene su propio MCP.

Sirve para que un asistente como Codex o ChatGPT pueda ayudarte a:

- ver tablas,
- consultar datos,
- revisar logs,
- aplicar migraciones,
- generar tipos.

Pero no es lo mismo que nuestro Agency MCP.

Nuestro MCP es el producto de agencia.
Supabase MCP es una herramienta de desarrollo.

Regla importante:

No conectes Supabase MCP con escritura libre a datos reales de produccion.

Si lo usas, mejor:

```text
project scoped
read only
solo feature groups necesarios
```

## 15. Preparar el VPS IONOS

Antes de desplegar:

1. Tener acceso SSH al VPS.
2. Tener Docker instalado.
3. Tener Docker Compose instalado.
4. Tener Caddy instalado o usar el `Caddyfile` del repo.
5. Tener un subdominio preparado, por ejemplo:

```text
mcp.tudominio.com
```

6. Apuntar DNS del subdominio a la IP del VPS.

## 16. Variables de entorno para produccion

En el VPS, el `.env` deberia parecerse a esto:

```env
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://mcp.tudominio.com
READ_ONLY_MODE=true
ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
REQUIRE_MCP_AUTH=true
MCP_BEARER_TOKEN=un-token-muy-largo-y-aleatorio
LOG_LEVEL=info
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
```

Generar token largo:

```bash
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

Guarda ese token en un gestor de contrasenas.

## 17. Ojo con la autenticacion y ChatGPT

Punto importante:

El servidor ya puede proteger `/mcp` con bearer token, pero la conexion final desde ChatGPT puede requerir un flujo compatible con lo que ChatGPT permita configurar en Connectors.

Para una prueba inicial sin datos reales:

- puedes usar `REQUIRE_MCP_AUTH=false`,
- mantener solo datos mock,
- mantener `READ_ONLY_MODE=true`.

Para produccion real:

- no dejes datos reales expuestos sin autenticacion,
- lo ideal sera implementar OAuth 2.1 compatible con MCP,
- o confirmar que el conector puede enviar el bearer token de forma segura.

No conectes datos reales de clientes a un MCP publico sin autenticacion.

## 18. Desplegar en VPS

En el VPS:

```bash
git clone https://github.com/curroruiz97/agency-seo-geo-mcp.git
cd agency-seo-geo-mcp
cp .env.example .env
nano .env
```

Editar `.env` con valores reales.

Construir:

```bash
docker compose up -d --build
```

Ver logs:

```bash
docker logs --tail 200 agency-seo-geo-mcp
```

Comprobar:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl http://127.0.0.1:3000/version
```

## 19. Configurar Caddy

El `Caddyfile` del repo contiene un ejemplo.

Debes cambiar:

```text
mcp.tudominio.com
```

por tu dominio real.

Despues:

```bash
caddy reload
```

Comprobar desde tu ordenador:

```bash
curl https://mcp.tudominio.com/health
```

## 20. Conectar en ChatGPT

Cuando el dominio funcione por HTTPS:

1. Abre ChatGPT.
2. Ve a Settings.
3. Entra en Connectors.
4. Activa Developer Mode si hace falta.
5. Crea un connector nuevo.
6. URL:

```text
https://mcp.tudominio.com/mcp
```

7. ChatGPT deberia detectar herramientas:

- ping
- get_server_status
- list_projects

Si no las detecta:

- revisa logs Docker,
- revisa Caddy,
- revisa HTTPS,
- revisa si la autenticacion esta bloqueando la conexion.

## 21. Primer test en ChatGPT

Pide:

```text
Usa el MCP Agency SEO/GEO y llama a ping.
```

Despues:

```text
Lista los proyectos activos disponibles.
```

Resultado esperado:

- devuelve proyectos mock si aun no conectaste Supabase,
- devuelve proyectos reales si ya implementaste el repositorio DB.

## 22. Que falta para produccion real

Antes de produccion con clientes reales falta:

1. OAuth 2.1 o autenticacion compatible y robusta.
2. Supabase Pro.
3. Migraciones aplicadas.
4. Repositorios DB reales.
5. Cifrado de credenciales en aplicacion.
6. Seed de proyectos piloto.
7. Logs compactos con retencion.
8. Backups revisados.
9. WordPress read-only.
10. SE Ranking read-only.
11. Rank Math read-only.
12. Approval engine.
13. Snapshots antes de escrituras.
14. Tests de integracion.

## 23. Orden recomendado desde aqui

### Paso 1

Crear proyecto Supabase Free.

### Paso 2

Configurar `.env` local con `DATABASE_URL` y `DIRECT_URL`.

### Paso 3

Ejecutar:

```bash
npm run db:generate
npm run db:migrate -- --name init_project_registry
```

### Paso 4

Crear seed de 3 proyectos piloto.

### Paso 5

Cambiar `list_projects` para leer de Supabase.

### Paso 6

Probar local:

```bash
npm run check
docker compose up -d --build
```

### Paso 7

Desplegar en VPS con Caddy.

### Paso 8

Conectar en ChatGPT con datos todavia no sensibles.

### Paso 9

Implementar WordPress read-only.

### Paso 10

Implementar SE Ranking read-only.

### Paso 11

Implementar Rank Math read-only.

### Paso 12

Solo despues de todo lo anterior, empezar propuestas, approvals y escrituras controladas.

## 24. Como saber que esta listo para produccion

No esta listo para produccion real hasta que puedas decir que si a todo esto:

- El dominio HTTPS funciona.
- ChatGPT detecta las tools.
- El MCP tiene autenticacion real.
- Supabase esta en Pro o equivalente.
- Hay backups.
- Hay logs.
- No se devuelven credenciales.
- `READ_ONLY_MODE=true` bloquea escrituras.
- Las tools de lectura funcionan.
- Hay tests de integracion.
- Hay un proceso claro de rollback.
- Hay aprobacion humana antes de cualquier cambio.
- Elementor sigue siendo solo lectura.

## 25. Resumen sencillo

Lo que tienes ahora es una base muy buena.

Lo siguiente no es hacer que el agente escriba en WordPress. Lo siguiente es:

```text
Supabase -> datos reales de proyectos -> list_projects real -> VPS -> ChatGPT
```

Cuando eso funcione bien, entonces se conectan WordPress, SE Ranking y Rank Math en modo solo lectura.

La regla de oro:

```text
Leer primero.
Proponer despues.
Aprobar antes de escribir.
Verificar siempre.
```
