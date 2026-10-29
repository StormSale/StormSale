<?php
/**
 * Plugin bootstrap and service container.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wires the plugin services to WordPress/WooCommerce and exposes lifecycle hooks.
 */
class StormSale_Plugin {

	const LOG_SOURCE = 'stormsale-woocommerce';

	/**
	 * Singleton instance.
	 *
	 * @var StormSale_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Settings service.
	 *
	 * @var StormSale_Settings
	 */
	private $settings;

	/**
	 * Referral tracking service.
	 *
	 * @var StormSale_Referral
	 */
	private $referral;

	/**
	 * Conversion logging service.
	 *
	 * @var StormSale_Conversion
	 */
	private $conversion;

	/**
	 * Retrieve (and lazily create) the singleton.
	 *
	 * @return StormSale_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->settings = new StormSale_Settings();

		if ( ! self::woocommerce_active() ) {
			add_action( 'admin_notices', array( $this, 'render_missing_woocommerce_notice' ) );
			return;
		}

		$this->settings->init();

		$this->referral   = new StormSale_Referral( $this->settings );
		$this->conversion = new StormSale_Conversion( $this->settings );

		$this->referral->init();
		$this->conversion->init();

		add_action( 'init', array( $this, 'load_textdomain' ) );
		add_action( 'admin_notices', array( $this, 'render_configuration_notice' ) );
	}

	/**
	 * Whether WooCommerce is available.
	 *
	 * @return bool
	 */
	public static function woocommerce_active() {
		return class_exists( 'WooCommerce' );
	}

	/**
	 * Get the settings service.
	 *
	 * @return StormSale_Settings
	 */
	public function settings() {
		return $this->settings;
	}

	/**
	 * Get the referral service.
	 *
	 * @return StormSale_Referral|null
	 */
	public function referral() {
		return $this->referral;
	}

	/**
	 * Get the conversion service.
	 *
	 * @return StormSale_Conversion|null
	 */
	public function conversion() {
		return $this->conversion;
	}

	/**
	 * Load translations.
	 *
	 * @return void
	 */
	public function load_textdomain() {
		load_plugin_textdomain(
			'stormsale-woocommerce',
			false,
			dirname( STORMSALE_WC_BASENAME ) . '/languages'
		);
	}

	/**
	 * Notify administrators when WooCommerce is missing.
	 *
	 * @return void
	 */
	public function render_missing_woocommerce_notice() {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}

		echo '<div class="notice notice-error"><p><strong>' .
			esc_html__( 'StormSale WooCommerce', 'stormsale-woocommerce' ) .
			'</strong> ' .
			esc_html__( 'requires WooCommerce to be installed and active.', 'stormsale-woocommerce' ) .
			'</p></div>';
	}

	/**
	 * Nudge administrators to finish configuration.
	 *
	 * @return void
	 */
	public function render_configuration_notice() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}

		if ( StormSale_Settings::is_configured() ) {
			return;
		}

		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;

		if ( $screen && false !== strpos( (string) $screen->id, StormSale_Settings::TAB ) ) {
			return;
		}

		$url = admin_url( 'admin.php?page=wc-settings&tab=' . StormSale_Settings::TAB );

		echo '<div class="notice notice-warning"><p><strong>' .
			esc_html__( 'StormSale is not configured yet.', 'stormsale-woocommerce' ) .
			'</strong> ' .
			sprintf(
				/* translators: %s: settings page URL. */
				wp_kses(
					__( 'Add your Campaign ID and API Key on the <a href="%s">StormSale settings page</a> to begin tracking conversions.', 'stormsale-woocommerce' ),
					array( 'a' => array( 'href' => array() ) )
				),
				esc_url( $url )
			) .
			'</p></div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped above.
	}

	/**
	 * Write a diagnostic entry to the WooCommerce log.
	 *
	 * @param string $message Log message.
	 * @param string $level   Log level (info|error|debug).
	 * @return void
	 */
	public static function log( $message, $level = 'info' ) {
		$settings = StormSale_Settings::get_settings();

		if ( 'error' !== $level && 'yes' !== $settings['debug_logging'] ) {
			return;
		}

		if ( ! function_exists( 'wc_get_logger' ) ) {
			return;
		}

		wc_get_logger()->log(
			'error' === $level ? 'error' : 'info',
			(string) $message,
			array( 'source' => self::LOG_SOURCE )
		);
	}

	/**
	 * Plugin activation routine.
	 *
	 * @return void
	 */
	public static function activate() {
		if ( ! defined( 'STORMSALE_WC_FILE' ) ) {
			return;
		}

		if ( ! class_exists( 'WooCommerce' ) ) {
			deactivate_plugins( plugin_basename( STORMSALE_WC_FILE ) );
		}
	}
}
