<?php

/**
 * Shared doubles for tests/uninstall_test.php.
 *
 * uninstall.php runs outside the plugin bootstrap, so this file defines the
 * minimum WordPress surface it touches and records every side effect. A probe
 * process writes the recording to disk from a shutdown handler, which means the
 * recording survives the `exit` performed by the WP_UNINSTALL_PLUGIN guard.
 */

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

if (!defined('ARRAY_A')) {
    define('ARRAY_A', 'ARRAY_A');
}

final class MGWS_Uninstall_WPDB {
    public string $prefix = 'wp_';

    /** @var string[] */
    public array $queries = array();

    public function query(mixed $query): int|bool {
        $this->queries[] = (string) $query;
        return 1;
    }
}

/**
 * Named after the real WordPress classes on purpose: uninstall.php guards its
 * capability removal with `instanceof`, and a stub with a different name would
 * make that guard always false.
 */
final class WP_Role {
    public array $capabilities;

    public function __construct(
        public string $name,
        array $capabilities = array()
    ) {
        $this->capabilities = $capabilities;
    }

    public function add_cap(string $cap): void {
        $this->capabilities[$cap] = true;
    }

    public function remove_cap(string $cap): void {
        $GLOBALS['mgws_uninstall_removed_caps'][] = $this->name . ':' . $cap;
        unset($this->capabilities[$cap]);
    }
}

final class WP_Roles {
    /** @var array<string, WP_Role> */
    public array $roles = array();

    public function add_role(string $name, array $capabilities = array()): void {
        $this->roles[$name] = new WP_Role($name, $capabilities);
    }

    public function get_names(): array {
        return array_keys($this->roles);
    }

    public function get_role(string $name): ?WP_Role {
        return $this->roles[$name] ?? null;
    }
}

final class MGWS_Uninstall_State {
    public static function fixture(): array {
        $path = (string) ($GLOBALS['mgws_uninstall_fixture_path'] ?? '');
        if ($path === '' || !is_file($path)) {
            return array();
        }
        $decoded = json_decode((string) file_get_contents($path), true);
        return is_array($decoded) ? $decoded : array();
    }

    public static function record(): array {
        global $wpdb;
        return array(
            'queries' => $wpdb->queries,
            'deleted_options' => $GLOBALS['mgws_uninstall_deleted_options'],
            'removed_caps' => $GLOBALS['mgws_uninstall_removed_caps'],
            'deleted_posts' => $GLOBALS['mgws_uninstall_deleted_posts'],
            'deleted_user_meta' => $GLOBALS['mgws_uninstall_deleted_user_meta'],
            'flushed_rewrite_rules' => $GLOBALS['mgws_uninstall_flushed'],
        );
    }

    public static function write(): void {
        $path = (string) ($GLOBALS['mgws_uninstall_state_path'] ?? '');
        if ($path === '') {
            return;
        }
        file_put_contents($path, json_encode(self::record()));
    }
}

function wp_roles(): WP_Roles {
    return $GLOBALS['mgws_uninstall_roles'];
}

function get_role(string $role): ?WP_Role {
    return wp_roles()->get_role($role);
}

function delete_option(string $option): bool {
    $GLOBALS['mgws_uninstall_deleted_options'][] = $option;
    return true;
}

function get_posts(array $arguments = array()): array {
    $postType = (string) ($arguments['post_type'] ?? 'post');
    $wantIds = ($arguments['fields'] ?? '') === 'ids';
    $found = array();
    foreach ($GLOBALS['mgws_uninstall_posts'] as $id => $post) {
        if ((string) $post['post_type'] !== $postType) {
            continue;
        }
        $found[] = $wantIds ? (int) $id : $post;
    }
    return $found;
}

function wp_delete_post(int $postId, bool $forceDelete = false): bool {
    $GLOBALS['mgws_uninstall_deleted_posts'][] = (int) $postId;
    unset($GLOBALS['mgws_uninstall_posts'][$postId]);
    return true;
}

function delete_metadata(string $metaType, int $objectId, string $metaKey, mixed $metaValue = '', bool $deleteAll = false): bool {
    if ($metaType === 'user' && $deleteAll) {
        $GLOBALS['mgws_uninstall_deleted_user_meta'][] = $metaKey;
    }
    return true;
}

function flush_rewrite_rules(bool $hard = true): void {
    $GLOBALS['mgws_uninstall_flushed'] = true;
}
