<?php
/**
 * Plugin Name:       StormSale WooCommerce
 * Plugin URI:        https://github.com/StormSale/StormSale
 * Description:       Tracks affiliate referral clicks and logs completed WooCommerce purchases to your StormSale smart campaign as AES-GCM encrypted, signed, verified Stellar ledger conversions.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            StormSale
 * Author URI:        https://github.com/StormSale
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       stormsale-woocommerce
 * Domain Path:       /languages
 * WC requires at least: 7.0
 * WC tested up to:   9.4
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'STORMSALE_WC_VERSION', '1.0.0' );
define( 'STORMSALE_WC_FILE', __FILE__ );
define( 'STORMSALE_WC_PATH', plugin_dir_path( __FILE__ ) );
define( 'STORMSALE_WC_URL', plugin_dir_url( __FILE__ ) );
define( 'STORMSALE_WC_BASENAME', plugin_basename( __FILE__ ) );

require_once STORMSALE_WC_PATH . 'includes/class-stormsale-crypto.php';
require_once STORMSALE_WC_PATH . 'includes/class-stormsale-settings.php';
require_once STORMSALE_WC_PATH . 'includes/class-stormsale-api-client.php';
require_once STORMSALE_WC_PATH . 'includes/class-stormsale-referral.php';
require_once STORMSALE_WC_PATH . 'includes/class-stormsale-conversion.php';
require_once STORMSALE_WC_PATH . 'includes/class-stormsale-plugin.php';

/**
 * Declare compatibility with WooCommerce High-Performance Order Storage (HPOS).
 */
add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
				'custom_order_tables',
				STORMSALE_WC_FILE,
				true
			);
		}
	}
);

/**
 * Boot the plugin once all plugins are loaded so WooCommerce is detectable.
 */
add_action( 'plugins_loaded', array( 'StormSale_Plugin', 'instance' ) );

register_activation_hook( __FILE__, array( 'StormSale_Plugin', 'activate' ) );
