<?php

if (!function_exists('dbDelta')) {
    function dbDelta(string $sql): array {
        global $wpdb;
        if (!$wpdb instanceof MGWS_Contract_WPDB) {
            throw new RuntimeException('dbDelta mock requires MGWS_Contract_WPDB');
        }
        return $wpdb->apply_db_delta($sql);
    }
}
