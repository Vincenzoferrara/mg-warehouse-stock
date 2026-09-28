<?php
/**
 * Plugin Name: MG Warehouse Stock
 * Description: Multi-site / multi-warehouse stock levels with room/rack/shelf picking and Woo order status "Accettato".
 * Version: 2.3.0
 * Author: MG
 * Text Domain: mg-warehouse-stock
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MGWS_PLUGIN_FILE', __FILE__);
define('MGWS_PLUGIN_DIR', __DIR__);
define('MGWS_PLUGIN_VERSION', '2.3.0');

require_once MGWS_PLUGIN_DIR . '/includes/class-mgws-plugin.php';

register_activation_hook(MGWS_PLUGIN_FILE, array('MGWS_Plugin', 'activate'));

add_action('plugins_loaded', array('MGWS_Plugin', 'instance'));
