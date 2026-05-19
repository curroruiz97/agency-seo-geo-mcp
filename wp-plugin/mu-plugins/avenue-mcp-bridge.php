<?php
/**
 * Plugin Name: Avenue MCP Bridge
 * Description: Registers RankMath SEO meta keys with show_in_rest so they can
 *              be read/written via WP REST API (/wp/v2/posts/{id}) using
 *              Application Passwords. Also exposes a small custom REST
 *              namespace (/avenue-mcp/v1/) for operations that don't fit the
 *              standard meta surface (schema multi, redirections).
 *
 * Author:      Avenue Media
 * Version:     0.1.0
 * Requires PHP: 7.4
 *
 * Drop this file in /wp-content/mu-plugins/ (create the folder if it doesn't
 * exist). Mu-plugins load automatically — no activation needed.
 */

if (!defined('ABSPATH')) {
    exit;
}

// -----------------------------------------------------------------------------
// 1. Register RankMath SEO post meta with show_in_rest so REST API can edit it.
// -----------------------------------------------------------------------------

add_action('init', function () {
    $post_types = ['post', 'page'];
    // Include any custom post types you also want to manage via REST:
    $extra = apply_filters('avenue_mcp_bridge_post_types', []);
    $post_types = array_unique(array_merge($post_types, $extra));

    $string_keys = [
        'rank_math_title',
        'rank_math_description',
        'rank_math_focus_keyword',
        'rank_math_canonical_url',
        'rank_math_breadcrumb_title',
        'rank_math_permalink',
        'rank_math_rich_snippet',
        'rank_math_pillar_content',
        'rank_math_facebook_title',
        'rank_math_facebook_description',
        'rank_math_facebook_image',
        'rank_math_twitter_title',
        'rank_math_twitter_description',
        'rank_math_twitter_image',
        'rank_math_twitter_card_type',
        'rank_math_ca_keyword'
    ];

    $int_keys = [
        'rank_math_primary_category',
        'rank_math_primary_product_cat',
        'rank_math_facebook_image_id',
        'rank_math_seo_score',
        'rank_math_contentai_score'
    ];

    $array_keys = [
        'rank_math_robots',
        'rank_math_advanced_robots'
    ];

    foreach ($post_types as $post_type) {
        foreach ($string_keys as $key) {
            register_post_meta($post_type, $key, [
                'type' => 'string',
                'single' => true,
                'show_in_rest' => true,
                'auth_callback' => 'avenue_mcp_bridge_can_edit_post_meta'
            ]);
        }
        foreach ($int_keys as $key) {
            register_post_meta($post_type, $key, [
                'type' => 'integer',
                'single' => true,
                'show_in_rest' => true,
                'auth_callback' => 'avenue_mcp_bridge_can_edit_post_meta'
            ]);
        }
        foreach ($array_keys as $key) {
            register_post_meta($post_type, $key, [
                'type' => 'array',
                'single' => true,
                'show_in_rest' => [
                    'schema' => [
                        'type' => 'array',
                        'items' => ['type' => 'string']
                    ]
                ],
                'auth_callback' => 'avenue_mcp_bridge_can_edit_post_meta'
            ]);
        }

        // Elementor meta keys (so we can read/inspect from REST; writes still
        // require an authenticated user with edit_post capability).
        register_post_meta($post_type, '_elementor_data', [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
            'auth_callback' => 'avenue_mcp_bridge_can_edit_post_meta'
        ]);
        register_post_meta($post_type, '_elementor_edit_mode', [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
            'auth_callback' => 'avenue_mcp_bridge_can_edit_post_meta'
        ]);
        register_post_meta($post_type, '_elementor_template_type', [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
            'auth_callback' => 'avenue_mcp_bridge_can_edit_post_meta'
        ]);
        register_post_meta($post_type, '_elementor_version', [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
            'auth_callback' => 'avenue_mcp_bridge_can_edit_post_meta'
        ]);
        register_post_meta($post_type, '_elementor_page_settings', [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
            'auth_callback' => 'avenue_mcp_bridge_can_edit_post_meta'
        ]);
    }
});

function avenue_mcp_bridge_can_edit_post_meta($allowed, $meta_key, $object_id, $user_id) {
    return user_can($user_id, 'edit_post', $object_id);
}

// -----------------------------------------------------------------------------
// 2. Custom REST namespace for operations that need server-side serialisation.
// -----------------------------------------------------------------------------

add_action('rest_api_init', function () {
    // POST /wp-json/avenue-mcp/v1/posts/{id}/schema
    // Body: { "type": "FAQPage", "payload": { "@type": "FAQPage", "mainEntity": [...] } }
    // → writes serialised PHP array to meta rank_math_schema_<Type>
    register_rest_route('avenue-mcp/v1', '/posts/(?P<id>\d+)/schema', [
        'methods' => 'POST',
        'permission_callback' => function ($request) {
            return current_user_can('edit_post', (int) $request['id']);
        },
        'callback' => function (WP_REST_Request $request) {
            $post_id = (int) $request['id'];
            $type = sanitize_text_field((string) $request->get_param('type'));
            $payload = $request->get_param('payload');

            if (!$type || !is_array($payload)) {
                return new WP_Error('avenue_mcp_invalid_schema_body', 'type and payload are required.', ['status' => 400]);
            }

            // RankMath stores each schema in its own post meta key.
            $meta_key = 'rank_math_schema_' . $type;
            update_post_meta($post_id, $meta_key, $payload);

            // Also flag rich_snippet for legacy display logic.
            if (!get_post_meta($post_id, 'rank_math_rich_snippet', true)) {
                update_post_meta($post_id, 'rank_math_rich_snippet', strtolower($type));
            }

            return new WP_REST_Response([
                'ok' => true,
                'post_id' => $post_id,
                'meta_key' => $meta_key
            ], 200);
        }
    ]);

    // GET /wp-json/avenue-mcp/v1/posts/{id}/schemas → returns all rank_math_schema_* meta
    register_rest_route('avenue-mcp/v1', '/posts/(?P<id>\d+)/schemas', [
        'methods' => 'GET',
        'permission_callback' => function ($request) {
            return current_user_can('edit_post', (int) $request['id']);
        },
        'callback' => function (WP_REST_Request $request) {
            $post_id = (int) $request['id'];
            $all_meta = get_post_meta($post_id);
            $schemas = [];
            foreach ($all_meta as $key => $value) {
                if (strpos($key, 'rank_math_schema_') === 0) {
                    $type = substr($key, strlen('rank_math_schema_'));
                    $schemas[$type] = maybe_unserialize($value[0] ?? '');
                }
            }
            return new WP_REST_Response($schemas, 200);
        }
    ]);

    // POST /wp-json/avenue-mcp/v1/sitemap/rebuild
    register_rest_route('avenue-mcp/v1', '/sitemap/rebuild', [
        'methods' => 'POST',
        'permission_callback' => function () {
            return current_user_can('manage_options');
        },
        'callback' => function () {
            // RankMath caches sitemap. Clearing transients forces a rebuild on next request.
            global $wpdb;
            $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_rank_math_sitemap_%' OR option_name LIKE '_transient_timeout_rank_math_sitemap_%'");
            return ['ok' => true, 'message' => 'Sitemap transients cleared. Visit /sitemap_index.xml to regenerate.'];
        }
    ]);

    // GET /wp-json/avenue-mcp/v1/health → echoes versions
    register_rest_route('avenue-mcp/v1', '/health', [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function () {
            return [
                'ok' => true,
                'wp_version' => get_bloginfo('version'),
                'rankmath_active' => is_plugin_active_for_network('seo-by-rank-math/rank-math.php') || is_plugin_active('seo-by-rank-math/rank-math.php') || class_exists('RankMath'),
                'rankmath_pro_active' => is_plugin_active('seo-by-rank-math-pro/rank-math-pro.php') || class_exists('RankMath_Pro'),
                'elementor_active' => did_action('elementor/loaded') > 0 || class_exists('Elementor\\Plugin'),
                'elementor_version' => defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : null,
                'bridge_version' => '0.1.0'
            ];
        }
    ]);
});

// -----------------------------------------------------------------------------
// 3. Ensure rest_authentication_errors does not block Application Passwords.
// -----------------------------------------------------------------------------

// (No-op in stock WP — Application Passwords are allowed by core in 5.6+.
//  This file lives here only to document the assumption.)
