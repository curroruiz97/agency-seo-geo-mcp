# Avenue MCP Bridge — WordPress mu-plugin

Pequeño mu-plugin que conecta WordPress + RankMath con el MCP de Avenue.

## Qué hace

1. **Registra los meta keys de RankMath con `show_in_rest`** para que se
   puedan leer y escribir vía la WP REST API estándar (`/wp/v2/posts/{id}`)
   usando Application Passwords. RankMath **no lo hace por defecto**, por
   eso este plugin es imprescindible.

2. **Expone un namespace REST propio `/avenue-mcp/v1/`** para operaciones
   que no encajan en el meta surface:

   - `POST /avenue-mcp/v1/posts/{id}/schema` — guarda un schema multi-RankMath
     (`rank_math_schema_<Type>`) recibiendo JSON, lo serializa server-side.
   - `GET  /avenue-mcp/v1/posts/{id}/schemas` — lee todos los schemas del post.
   - `POST /avenue-mcp/v1/sitemap/rebuild` — limpia transients para regenerar
     el sitemap de RankMath.
   - `GET  /avenue-mcp/v1/health` — devuelve estado del WP, RankMath y
     Elementor. Útil para que el MCP verifique compatibilidad antes de operar.

## Instalación

1. Conectarte por FTP/SSH al WordPress de cada sitio.
2. Crear la carpeta `wp-content/mu-plugins/` si no existe.
3. Copiar `avenue-mcp-bridge.php` dentro de esa carpeta.
4. Listo. Los mu-plugins se cargan automáticamente, no hay nada que activar
   en el panel de plugins.

Para verificar:

```bash
curl https://tu-sitio.com/wp-json/avenue-mcp/v1/health
```

Debe devolver `{"ok":true, "wp_version":"...", "rankmath_active":true, ...}`.

## Seguridad

- Todas las operaciones de escritura requieren un usuario autenticado con
  capability `edit_post` sobre el post en cuestión.
- El sitemap rebuild requiere `manage_options`.
- El endpoint `/health` es público pero solo expone versiones (información
  ya visible en el HTML del sitio).
- No hay nonces — la autenticación viene de Application Passwords (Basic
  Auth) que es el estándar de WP REST.

## Compatibilidad

- WordPress 5.6+ (Application Passwords)
- RankMath SEO (free o Pro)
- Elementor 3.x (free; los meta keys de Elementor también se exponen para
  inspección/edición)
- PHP 7.4+

## Roll-out a 30-40 sitios

Opciones recomendadas:

1. **Manual (SFTP)**: copiar el archivo a cada wp-content/mu-plugins/.
2. **WP-CLI**: si tienes acceso SSH a los sitios,
   `wp scaffold mu-plugin --content "$(cat avenue-mcp-bridge.php)" --name=avenue-mcp-bridge`
3. **MainWP / ManageWP**: deploy el mismo archivo a todas las instalaciones
   desde el panel central.
4. **Git deploy**: si tu hosting tiene Git, añadir el repo del mu-plugin
   como submodule en `wp-content/mu-plugins/`.

Recomiendo opción 3 si manejas los 30-40 sitios desde un panel central. Es
la más rápida y trazable.
