<?php
/**
 * Plugin Name: Avenue MCP Blog Automation
 * Description: Per-site Blog Automation settings (template, sector, seed keywords,
 *              language, default category/author, render mode, image policy) shown
 *              in wp-admin and exposed to the Avenue MCP via REST so each website
 *              can self-configure once at install time.
 *
 * Author:       Avenue Media
 * Version:      1.0.0
 * Requires PHP: 7.4
 *
 * Drop this file in /wp-content/mu-plugins/ (create the folder if it doesn't
 * exist). Mu-plugins load automatically — no activation needed. It is ADDITIVE:
 * it only registers a new options page and new REST routes under avenue-mcp/v1,
 * so it coexists with the main Avenue MCP Bridge plugin.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('AVENUE_MCP_BLOG_OPTION')) {
    define('AVENUE_MCP_BLOG_OPTION', 'avenue_mcp_blog_config');
}

function avenue_mcp_blog_defaults() {
    return [
        'configured'          => false,
        'sector'              => '',
        'seed_keywords'       => [],
        'language'            => 'es-ES',
        'city'                => '',
        'default_category_id' => 0,
        'default_author_id'   => 0,
        'render_mode'         => 'theme-builder-single',
        'template_id'         => 0,
        'template_name'       => '',
        'template_type'       => '',
        'min_images'          => 4,
        'image_source'        => 'pexels',
        'notes'               => '',
    ];
}

function avenue_mcp_blog_get_config() {
    $saved = get_option(AVENUE_MCP_BLOG_OPTION, []);
    if (!is_array($saved)) {
        $saved = [];
    }
    return array_merge(avenue_mcp_blog_defaults(), $saved);
}

/** List Elementor saved templates / Theme Builder documents for the dropdown + REST. */
function avenue_mcp_blog_get_templates() {
    $items = get_posts([
        'post_type'   => 'elementor_library',
        'numberposts' => -1,
        'post_status' => ['publish', 'draft', 'private'],
        'orderby'     => 'title',
        'order'       => 'ASC',
    ]);
    $out = [];
    foreach ($items as $tpl) {
        $out[] = [
            'id'   => (int) $tpl->ID,
            'name' => $tpl->post_title,
            'type' => (string) get_post_meta($tpl->ID, '_elementor_template_type', true),
        ];
    }
    return $out;
}

function avenue_mcp_blog_sanitize($input) {
    $defaults = avenue_mcp_blog_defaults();
    $input = is_array($input) ? $input : [];
    $clean = [];

    $clean['sector']   = isset($input['sector']) ? sanitize_text_field($input['sector']) : '';
    $clean['language'] = isset($input['language']) && $input['language'] !== '' ? sanitize_text_field($input['language']) : 'es-ES';
    $clean['city']     = isset($input['city']) ? sanitize_text_field($input['city']) : '';
    $clean['notes']    = isset($input['notes']) ? sanitize_textarea_field($input['notes']) : '';

    // seed_keywords: textarea (one per line or comma-separated) -> clean array.
    $raw = isset($input['seed_keywords']) ? (string) $input['seed_keywords'] : '';
    $parts = preg_split('/[\r\n,]+/', $raw);
    $seeds = [];
    foreach ($parts as $p) {
        $p = sanitize_text_field(trim($p));
        if ($p !== '') {
            $seeds[] = $p;
        }
    }
    $clean['seed_keywords'] = array_values(array_unique($seeds));

    $clean['default_category_id'] = isset($input['default_category_id']) ? max(0, (int) $input['default_category_id']) : 0;
    $clean['default_author_id']   = isset($input['default_author_id']) ? max(0, (int) $input['default_author_id']) : 0;
    $clean['template_id']         = isset($input['template_id']) ? max(0, (int) $input['template_id']) : 0;

    $mode = isset($input['render_mode']) ? sanitize_text_field($input['render_mode']) : 'theme-builder-single';
    $clean['render_mode'] = in_array($mode, ['theme-builder-single', 'cloned-layout'], true) ? $mode : 'theme-builder-single';

    $clean['min_images']   = isset($input['min_images']) ? min(20, max(1, (int) $input['min_images'])) : 4;
    $clean['image_source'] = isset($input['image_source']) ? sanitize_text_field($input['image_source']) : 'pexels';

    // Resolve template name/type from the chosen id for documentation/REST.
    $clean['template_name'] = '';
    $clean['template_type'] = '';
    if ($clean['template_id'] > 0) {
        $tpl = get_post($clean['template_id']);
        if ($tpl) {
            $clean['template_name'] = $tpl->post_title;
            $clean['template_type'] = (string) get_post_meta($clean['template_id'], '_elementor_template_type', true);
        }
    }

    $clean['configured'] = true;
    return array_merge($defaults, $clean);
}

// -----------------------------------------------------------------------------
// Admin settings page (Settings -> Avenue Blog)
// -----------------------------------------------------------------------------

add_action('admin_menu', function () {
    add_options_page(
        'Avenue Blog Automation',
        'Avenue Blog',
        'manage_options',
        'avenue-blog-automation',
        'avenue_mcp_blog_render_page'
    );
});

add_action('admin_init', function () {
    register_setting('avenue_mcp_blog_group', AVENUE_MCP_BLOG_OPTION, [
        'type'              => 'array',
        'sanitize_callback' => 'avenue_mcp_blog_sanitize',
        'default'           => avenue_mcp_blog_defaults(),
    ]);
});

function avenue_mcp_blog_render_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $cfg        = avenue_mcp_blog_get_config();
    $templates  = avenue_mcp_blog_get_templates();
    $categories = get_categories(['hide_empty' => false]);
    $authors    = get_users(['capability' => 'edit_posts', 'number' => 100]);
    $seeds_text = is_array($cfg['seed_keywords']) ? implode("\n", $cfg['seed_keywords']) : '';
    $opt        = AVENUE_MCP_BLOG_OPTION;
    ?>
    <div class="wrap">
        <h1>Avenue Blog Automation</h1>
        <p>Configura cómo el MCP genera artículos de blog para <strong><?php echo esc_html(get_bloginfo('name')); ?></strong>.
           Estos ajustes los lee el MCP vía REST (<code>/wp-json/avenue-mcp/v1/blog-config</code>).</p>
        <form method="post" action="options.php">
            <?php settings_fields('avenue_mcp_blog_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="amb_template">Plantilla de entrada de blog</label></th>
                    <td>
                        <select name="<?php echo esc_attr($opt); ?>[template_id]" id="amb_template">
                            <option value="0">— Sin plantilla específica (usa Theme Builder por condición) —</option>
                            <?php foreach ($templates as $t) : ?>
                                <option value="<?php echo esc_attr($t['id']); ?>" <?php selected($cfg['template_id'], $t['id']); ?>>
                                    <?php echo esc_html($t['name']); ?><?php echo $t['type'] ? ' (' . esc_html($t['type']) . ')' : ''; ?> — #<?php echo esc_html($t['id']); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description">Plantillas de Elementor detectadas en este sitio. Para <em>theme-builder-single</em> es opcional (la Single se aplica por condición).</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_render">Modo de render</label></th>
                    <td>
                        <select name="<?php echo esc_attr($opt); ?>[render_mode]" id="amb_render">
                            <option value="theme-builder-single" <?php selected($cfg['render_mode'], 'theme-builder-single'); ?>>theme-builder-single (recomendado)</option>
                            <option value="cloned-layout" <?php selected($cfg['render_mode'], 'cloned-layout'); ?>>cloned-layout</option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_sector">Sector / temática</label></th>
                    <td><input type="text" class="regular-text" name="<?php echo esc_attr($opt); ?>[sector]" id="amb_sector" value="<?php echo esc_attr($cfg['sector']); ?>"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_seeds">Seed keywords del sector</label></th>
                    <td>
                        <textarea class="large-text" rows="5" name="<?php echo esc_attr($opt); ?>[seed_keywords]" id="amb_seeds" placeholder="Una por línea o separadas por comas"><?php echo esc_textarea($seeds_text); ?></textarea>
                        <p class="description">El MCP las usa como semilla para la investigación de keywords (SE Ranking).</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_lang">Idioma</label></th>
                    <td><input type="text" name="<?php echo esc_attr($opt); ?>[language]" id="amb_lang" value="<?php echo esc_attr($cfg['language']); ?>"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_city">Ciudad / ámbito local</label></th>
                    <td><input type="text" class="regular-text" name="<?php echo esc_attr($opt); ?>[city]" id="amb_city" value="<?php echo esc_attr($cfg['city']); ?>"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_cat">Categoría por defecto</label></th>
                    <td>
                        <select name="<?php echo esc_attr($opt); ?>[default_category_id]" id="amb_cat">
                            <option value="0">— Ninguna —</option>
                            <?php foreach ($categories as $c) : ?>
                                <option value="<?php echo esc_attr($c->term_id); ?>" <?php selected($cfg['default_category_id'], $c->term_id); ?>>
                                    <?php echo esc_html($c->name); ?> (#<?php echo esc_html($c->term_id); ?>)
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_author">Autor por defecto</label></th>
                    <td>
                        <select name="<?php echo esc_attr($opt); ?>[default_author_id]" id="amb_author">
                            <option value="0">— Ninguno —</option>
                            <?php foreach ($authors as $a) : ?>
                                <option value="<?php echo esc_attr($a->ID); ?>" <?php selected($cfg['default_author_id'], $a->ID); ?>>
                                    <?php echo esc_html($a->display_name); ?> (#<?php echo esc_html($a->ID); ?>)
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_min">Nº mínimo de imágenes</label></th>
                    <td><input type="number" min="1" max="20" name="<?php echo esc_attr($opt); ?>[min_images]" id="amb_min" value="<?php echo esc_attr($cfg['min_images']); ?>"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_imgsrc">Fuente de imágenes</label></th>
                    <td><input type="text" name="<?php echo esc_attr($opt); ?>[image_source]" id="amb_imgsrc" value="<?php echo esc_attr($cfg['image_source']); ?>" placeholder="pexels / unsplash"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb_notes">Notas</label></th>
                    <td><textarea class="large-text" rows="3" name="<?php echo esc_attr($opt); ?>[notes]" id="amb_notes"><?php echo esc_textarea($cfg['notes']); ?></textarea></td>
                </tr>
            </table>
            <?php submit_button('Guardar configuración'); ?>
        </form>
    </div>
    <?php
}

// -----------------------------------------------------------------------------
// REST: expose the config + templates to the MCP (Application Password auth).
// -----------------------------------------------------------------------------

add_action('rest_api_init', function () {
    register_rest_route('avenue-mcp/v1', '/blog-config', [
        [
            'methods'             => 'GET',
            'permission_callback' => function () { return current_user_can('edit_posts'); },
            'callback'            => function () {
                return new WP_REST_Response(avenue_mcp_blog_get_config(), 200);
            },
        ],
        [
            'methods'             => 'POST',
            'permission_callback' => function () { return current_user_can('manage_options'); },
            'callback'            => function (WP_REST_Request $request) {
                $body = $request->get_json_params();
                if (!is_array($body)) {
                    $body = [];
                }
                // Merge over the currently-saved config, then sanitise.
                $merged = array_merge(avenue_mcp_blog_get_config(), $body);
                // seed_keywords may arrive as an array from the MCP; normalise to text for the sanitiser.
                if (isset($merged['seed_keywords']) && is_array($merged['seed_keywords'])) {
                    $merged['seed_keywords'] = implode("\n", $merged['seed_keywords']);
                }
                $clean = avenue_mcp_blog_sanitize($merged);
                update_option(AVENUE_MCP_BLOG_OPTION, $clean);
                return new WP_REST_Response(['ok' => true, 'config' => $clean], 200);
            },
        ],
    ]);

    register_rest_route('avenue-mcp/v1', '/elementor-templates', [
        'methods'             => 'GET',
        'permission_callback' => function () { return current_user_can('edit_posts'); },
        'callback'            => function () {
            return new WP_REST_Response(avenue_mcp_blog_get_templates(), 200);
        },
    ]);
});
