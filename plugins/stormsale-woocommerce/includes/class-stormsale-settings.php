<?php
/**
 * Merchant configuration screen (WooCommerce > Settings > StormSale).
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers and persists the plugin settings using the native WooCommerce
 * settings tab API so all fields live inside the familiar admin experience.
 */
class StormSale_Settings {

	const TAB = 'stormsale';

	const OPTION_CAMPAIGN_ID          = 'stormsale_campaign_id';
	const OPTION_API_KEY              = 'stormsale_api_key';
	const OPTION_GATEWAY_URL          = 'stormsale_gateway_url';
	const OPTION_CLICK_TRACKING       = 'stormsale_enable_click_tracking';
	const OPTION_CONVERSION_LOGGING   = 'stormsale_enable_conversion_logging';
	const OPTION_COOKIE_TTL           = 'stormsale_cookie_ttl_days';
	const OPTION_DEBUG_LOGGING        = 'stormsale_debug_logging';
	const OPTION_LAST_STATUS          = 'stormsale_last_status';
	const OPTION_LAST_ERROR           = 'stormsale_last_error';
	const OPTION_LAST_TX_HASH         = 'stormsale_last_tx_hash';
	const OPTION_LAST_SUCCESS_AT      = 'stormsale_last_success_at';
	const OPTION_LAST_ATTEMPT_AT      = 'stormsale_last_attempt_at';

	const DEFAULT_GATEWAY_URL  = 'https://api.stormsale.io/api/v1/conversions';
	const DEFAULT_COOKIE_TTL   = 30;

	/**
	 * Register WordPress hooks.
	 *
	 * @return void
	 */
	public function init() {
		add_filter( 'woocommerce_settings_tabs_array', array( $this, 'add_tab' ), 50 );
		add_action( 'woocommerce_settings_' . self::TAB, array( $this, 'render' ) );
		add_action( 'woocommerce_update_options_' . self::TAB, array( $this, 'save' ) );
		add_filter( 'plugin_action_links_' . STORMSALE_WC_BASENAME, array( $this, 'action_links' ) );
	}

	/**
	 * Default values for every setting.
	 *
	 * @return array<string,string|int>
	 */
	public static function defaults() {
		return array(
			'campaign_id'               => '',
			'api_key'                   => '',
			'gateway_url'               => self::DEFAULT_GATEWAY_URL,
			'enable_click_tracking'     => 'yes',
			'enable_conversion_logging' => 'yes',
			'cookie_ttl_days'           => self::DEFAULT_COOKIE_TTL,
			'debug_logging'             => 'no',
		);
	}

	/**
	 * Map logical keys to their stored option names.
	 *
	 * @return array<string,string>
	 */
	public static function option_map() {
		return array(
			'campaign_id'               => self::OPTION_CAMPAIGN_ID,
			'api_key'                   => self::OPTION_API_KEY,
			'gateway_url'               => self::OPTION_GATEWAY_URL,
			'enable_click_tracking'     => self::OPTION_CLICK_TRACKING,
			'enable_conversion_logging' => self::OPTION_CONVERSION_LOGGING,
			'cookie_ttl_days'           => self::OPTION_COOKIE_TTL,
			'debug_logging'             => self::OPTION_DEBUG_LOGGING,
		);
	}

	/**
	 * Constants may be used to configure the plugin in headless/deploy pipelines.
	 *
	 * @return array<string,string>
	 */
	public static function constant_map() {
		return array(
			'campaign_id' => 'STORMSALE_WC_CAMPAIGN_ID',
			'api_key'     => 'STORMSALE_WC_API_KEY',
			'gateway_url' => 'STORMSALE_WC_GATEWAY_URL',
		);
	}

	/**
	 * Retrieve every setting merged with defaults, constants and type casts.
	 *
	 * @return array<string,mixed>
	 */
	public static function get_settings() {
		$defaults = self::defaults();
		$settings = array();

		foreach ( self::option_map() as $key => $option_name ) {
			$value = get_option( $option_name, $defaults[ $key ] );

			if ( '' === $value || null === $value || false === $value ) {
				$value = $defaults[ $key ];
			}

			$settings[ $key ] = $value;
		}

		foreach ( self::constant_map() as $key => $constant ) {
			if ( defined( $constant ) && '' !== (string) constant( $constant ) ) {
				$settings[ $key ] = (string) constant( $constant );
			}
		}

		$settings['cookie_ttl_days'] = self::sanitize_ttl( $settings['cookie_ttl_days'] );
		$settings['gateway_url']     = is_string( $settings['gateway_url'] ) ? $settings['gateway_url'] : '';

		return $settings;
	}

	/**
	 * Retrieve a single setting.
	 *
	 * @param string $key     Logical setting key.
	 * @param mixed  $default Optional override when the key is unknown.
	 * @return mixed
	 */
	public static function get( $key, $default = null ) {
		$settings = self::get_settings();

		if ( array_key_exists( $key, $settings ) ) {
			return $settings[ $key ];
		}

		return $default;
	}

	/**
	 * Whether the merchant has supplied the required credentials.
	 *
	 * @param array|null $settings Optional pre-fetched settings.
	 * @return bool
	 */
	public static function is_configured( $settings = null ) {
		$settings = is_array( $settings ) ? $settings : self::get_settings();

		return '' !== trim( (string) $settings['campaign_id'] )
			&& '' !== trim( (string) $settings['api_key'] )
			&& '' !== trim( (string) $settings['gateway_url'] );
	}

	/**
	 * Clamp the cookie lifetime to a sane range.
	 *
	 * @param mixed $value Raw value.
	 * @return int
	 */
	public static function sanitize_ttl( $value ) {
		$ttl = (int) $value;

		if ( $ttl < 1 ) {
			$ttl = self::DEFAULT_COOKIE_TTL;
		}

		if ( $ttl > 365 ) {
			$ttl = 365;
		}

		return $ttl;
	}

	/**
	 * Register the custom WooCommerce settings tab.
	 *
	 * @param array<string,string> $tabs Existing tabs.
	 * @return array<string,string>
	 */
	public function add_tab( $tabs ) {
		$tabs[ self::TAB ] = __( 'StormSale', 'stormsale-woocommerce' );

		return $tabs;
	}

	/**
	 * Add a direct settings shortcut on the plugins screen.
	 *
	 * @param array<int,string> $links Existing action links.
	 * @return array<int,string>
	 */
	public function action_links( $links ) {
		$settings_url = admin_url( 'admin.php?page=wc-settings&tab=' . self::TAB );
		$link         = '<a href="' . esc_url( $settings_url ) . '">' . esc_html__( 'Settings', 'stormsale-woocommerce' ) . '</a>';

		array_unshift( $links, $link );

		return $links;
	}

	/**
	 * Declarative field schema consumed by the WooCommerce settings API.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public function get_fields() {
		$fields = array(
			array(
				'title'       => __( 'StormSale Credentials', 'stormsale-woocommerce' ),
				'type'        => 'title',
				'id'          => 'stormsale_credentials_section',
				'description' => __(
					'Enter the Campaign ID and API Key from your StormSale merchant dashboard. Both fields are required before conversions can be logged.',
					'stormsale-woocommerce'
				),
			),
			array(
				'title'    => __( 'Campaign ID', 'stormsale-woocommerce' ),
				'type'     => 'text',
				'id'       => self::OPTION_CAMPAIGN_ID,
				'default'  => self::defaults()['campaign_id'],
				'desc'     => __( 'The StormSale smart campaign that should receive referral clicks and conversions.', 'stormsale-woocommerce' ),
				'desc_tip' => true,
			),
			array(
				'title'    => __( 'API Key', 'stormsale-woocommerce' ),
				'type'     => 'password',
				'id'       => self::OPTION_API_KEY,
				'default'  => self::defaults()['api_key'],
				'desc'     => __( 'Used to encrypt every order payload (AES-256-GCM) and sign each gateway request (HMAC-SHA256).', 'stormsale-woocommerce' ),
				'desc_tip' => true,
			),
			array(
				'title'       => __( 'Gateway Endpoint', 'stormsale-woocommerce' ),
				'type'        => 'url',
				'id'          => self::OPTION_GATEWAY_URL,
				'default'     => self::DEFAULT_GATEWAY_URL,
				'desc'        => __( 'StormSale gateway URL that receives encrypted conversion postbacks.', 'stormsale-woocommerce' ),
				'desc_tip'    => true,
				'placeholder' => self::DEFAULT_GATEWAY_URL,
			),
			array(
				'type' => 'sectionend',
				'id'   => 'stormsale_credentials_section',
			),
			array(
				'title' => __( 'Tracking', 'stormsale-woocommerce' ),
				'type'  => 'title',
				'id'    => 'stormsale_tracking_section',
			),
			array(
				'title'   => __( 'Referral click tracking', 'stormsale-woocommerce' ),
				'type'    => 'checkbox',
				'id'      => self::OPTION_CLICK_TRACKING,
				'default' => 'yes',
				'desc'    => __( 'Capture affiliate referral links and log clicks to your campaign.', 'stormsale-woocommerce' ),
			),
			array(
				'title'   => __( 'Conversion logging', 'stormsale-woocommerce' ),
				'type'    => 'checkbox',
				'id'      => self::OPTION_CONVERSION_LOGGING,
				'default' => 'yes',
				'desc'    => __( 'Transmit completed orders to StormSale when payment completes.', 'stormsale-woocommerce' ),
			),
			array(
				'title'             => __( 'Referral cookie lifetime (days)', 'stormsale-woocommerce' ),
				'type'              => 'number',
				'id'                => self::OPTION_COOKIE_TTL,
				'default'           => (string) self::DEFAULT_COOKIE_TTL,
				'css'               => 'width:90px;',
				'custom_attributes' => array(
					'min'  => '1',
					'max'  => '365',
					'step' => '1',
				),
				'desc'              => __( 'How long a referral is remembered across the cart and checkout lifecycle.', 'stormsale-woocommerce' ),
				'desc_tip'          => true,
			),
			array(
				'title'   => __( 'Debug logging', 'stormsale-woocommerce' ),
				'type'    => 'checkbox',
				'id'      => self::OPTION_DEBUG_LOGGING,
				'default' => 'no',
				'desc'    => __( 'Write detailed diagnostics to WooCommerce > Status > Logs.', 'stormsale-woocommerce' ),
			),
			array(
				'type' => 'sectionend',
				'id'   => 'stormsale_tracking_section',
			),
		);

		/**
		 * Filter the StormSale settings fields.
		 *
		 * @param array $fields Field schema.
		 */
		return apply_filters( 'stormsale_wc_settings_fields', $fields );
	}

	/**
	 * Render the settings screen.
	 *
	 * @return void
	 */
	public function render() {
		$settings = self::get_settings();

		if ( ! self::is_configured( $settings ) ) {
			echo '<div class="notice notice-warning inline"><p><strong>' .
				esc_html__( 'StormSale is not fully configured.', 'stormsale-woocommerce' ) .
				'</strong> ' .
				esc_html__( 'Add your Campaign ID and API Key below to start logging conversions.', 'stormsale-woocommerce' ) .
				'</p></div>';
		}

		woocommerce_admin_fields( $this->get_fields() );
		$this->render_status_panel();
	}

	/**
	 * Render the read-only connection status panel.
	 *
	 * @return void
	 */
	public function render_status_panel() {
		$status     = (string) get_option( self::OPTION_LAST_STATUS, '' );
		$last_error = (string) get_option( self::OPTION_LAST_ERROR, '' );
		$tx_hash    = (string) get_option( self::OPTION_LAST_TX_HASH, '' );
		$success_at = (string) get_option( self::OPTION_LAST_SUCCESS_AT, '' );
		$attempt_at = (string) get_option( self::OPTION_LAST_ATTEMPT_AT, '' );

		echo '<h2>' . esc_html__( 'Connection status', 'stormsale-woocommerce' ) . '</h2>';
		echo '<table class="form-table" role="presentation"><tbody>';

		$this->render_status_row(
			__( 'Last gateway status', 'stormsale-woocommerce' ),
			'' === $status ? __( 'No conversions sent yet', 'stormsale-woocommerce' ) : $status
		);
		$this->render_status_row(
			__( 'Last ledger transaction', 'stormsale-woocommerce' ),
			'' === $tx_hash ? '—' : $tx_hash
		);
		$this->render_status_row(
			__( 'Last verified conversion', 'stormsale-woocommerce' ),
			'' === $success_at ? '—' : $success_at
		);
		$this->render_status_row(
			__( 'Last attempt', 'stormsale-woocommerce' ),
			'' === $attempt_at ? '—' : $attempt_at
		);

		if ( '' !== $last_error ) {
			$this->render_status_row( __( 'Last error', 'stormsale-woocommerce' ), $last_error );
		}

		echo '</tbody></table>';
	}

	/**
	 * Render a single status row.
	 *
	 * @param string $label Row label.
	 * @param string $value Row value.
	 * @return void
	 */
	private function render_status_row( $label, $value ) {
		echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td><code>' .
			esc_html( $value ) . '</code></td></tr>';
	}

	/**
	 * Persist the settings screen.
	 *
	 * @return void
	 */
	public function save() {
		woocommerce_update_options( $this->get_fields() );

		$ttl = self::sanitize_ttl( get_option( self::OPTION_COOKIE_TTL, self::DEFAULT_COOKIE_TTL ) );
		update_option( self::OPTION_COOKIE_TTL, $ttl );
	}
}
