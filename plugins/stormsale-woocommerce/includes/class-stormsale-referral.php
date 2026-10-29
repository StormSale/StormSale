<?php
/**
 * Affiliate referral click tracking and order attribution.
 *
 * The referral is persisted in a signed, tamper-proof cookie that survives the
 * full cart -> checkout -> order lifecycle, and each new click is forwarded to
 * the StormSale gateway asynchronously.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Captures, validates and attributes affiliate referrals.
 */
class StormSale_Referral {

	const COOKIE_NAME          = 'stormsale_ref';
	const PARAM_AFFILIATE      = 'ss_ref';
	const PARAM_CLICK          = 'ss_click';
	const REST_NAMESPACE       = 'stormsale/v1';
	const REST_ROUTE           = '/click';
	const CLICK_RETRY_HOOK     = 'stormsale_dispatch_click';
	const CLICK_DEDUPE_PREFIX  = 'stormsale_click_';
	const CLICK_DEDUPE_SECONDS = 120;
	const COOKIE_VERSION       = 'v1';

	const META_AFFILIATE  = '_stormsale_affiliate_id';
	const META_CLICK_ID   = '_stormsale_click_id';
	const META_CAMPAIGN   = '_stormsale_campaign_id';
	const META_CAPTURED   = '_stormsale_captured_at';

	/**
	 * Settings service.
	 *
	 * @var StormSale_Settings
	 */
	private $settings;

	/**
	 * Queued click payloads awaiting shutdown dispatch.
	 *
	 * @var array<int,array<string,mixed>>
	 */
	private static $pending_clicks = array();

	/**
	 * Constructor.
	 *
	 * @param StormSale_Settings $settings Settings service.
	 */
	public function __construct( StormSale_Settings $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Register WordPress and WooCommerce hooks.
	 *
	 * @return void
	 */
	public function init() {
		add_action( 'init', array( $this, 'capture_referral' ), 5 );
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_tracking_script' ) );
		add_action( self::CLICK_RETRY_HOOK, array( $this, 'dispatch_click' ), 10, 1 );

		add_action( 'woocommerce_checkout_create_order', array( $this, 'attach_referral_to_order' ), 20, 2 );
		add_action( 'woocommerce_store_api_checkout_order_processed', array( $this, 'attach_referral_to_order' ), 20, 1 );
	}

	/**
	 * Whether click tracking is enabled and configured.
	 *
	 * @return bool
	 */
	public function is_enabled() {
		$settings = $this->settings->get_settings();

		return 'yes' === $settings['enable_click_tracking'] && StormSale_Settings::is_configured( $settings );
	}

	/**
	 * Front-end capture of referral query parameters.
	 *
	 * @return void
	 */
	public function capture_referral() {
		if ( is_admin() || ! $this->is_enabled() ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Public referral link, signature validated server side.
		$raw_affiliate = isset( $_GET[ self::PARAM_AFFILIATE ] ) ? wp_unslash( $_GET[ self::PARAM_AFFILIATE ] ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Public referral link, signature validated server side.
		$raw_click = isset( $_GET[ self::PARAM_CLICK ] ) ? wp_unslash( $_GET[ self::PARAM_CLICK ] ) : '';

		$affiliate = self::normalize_affiliate_id( $raw_affiliate );

		if ( '' === $affiliate ) {
			$this->refresh_existing_cookie();
			return;
		}

		$click_id   = self::normalize_click_id( $raw_click );
		$existing   = $this->get_referral();
		$is_new     = true;

		if ( null !== $existing && $existing['affiliate_id'] === $affiliate ) {
			if ( '' === $click_id ) {
				$click_id = $existing['click_id'];
			}

			$is_new = ( '' === $click_id || $click_id !== $existing['click_id'] );
		}

		if ( '' === $click_id ) {
			$click_id = StormSale_Crypto::uuid_v4();
		}

		$referral = $this->store_referral( $affiliate, $click_id );

		if ( null === $referral || ! $is_new ) {
			return;
		}

		$this->schedule_click(
			$referral,
			self::current_request_url()
		);
	}

	/**
	 * Extend the lifetime of an existing referral cookie on subsequent visits.
	 *
	 * @return void
	 */
	private function refresh_existing_cookie() {
		$existing = $this->get_referral();

		if ( null === $existing ) {
			return;
		}

		$settings = $this->settings->get_settings();
		$expires  = time() + ( (int) $settings['cookie_ttl_days'] * DAY_IN_SECONDS );

		if ( $expires - $existing['expires_at'] < DAY_IN_SECONDS ) {
			return;
		}

		$this->set_cookie( $existing['affiliate_id'], $existing['click_id'], $expires );
	}

	/**
	 * Persist a validated referral to the client cookie.
	 *
	 * @param string $affiliate Validated affiliate id.
	 * @param string $click_id  Click identifier.
	 * @return array<string,mixed>|null
	 */
	public function store_referral( $affiliate, $click_id ) {
		$settings = $this->settings->get_settings();
		$expires  = time() + ( (int) $settings['cookie_ttl_days'] * DAY_IN_SECONDS );

		$value = self::build_cookie_value(
			array(
				'affiliate_id' => $affiliate,
				'click_id'     => $click_id,
			),
			$this->cookie_secret(),
			$expires
		);

		$this->set_cookie( $affiliate, $click_id, $expires, $value );

		return array(
			'affiliate_id' => $affiliate,
			'click_id'     => $click_id,
			'expires_at'   => $expires,
		);
	}

	/**
	 * Write the cookie header (HTTP-only + SameSite=Lax + Secure on HTTPS).
	 *
	 * @param string      $affiliate Affiliate id.
	 * @param string      $click_id  Click id.
	 * @param int         $expires   Expiry timestamp.
	 * @param string|null $value     Optional precomputed cookie value.
	 * @return void
	 */
	private function set_cookie( $affiliate, $click_id, $expires, $value = null ) {
		if ( headers_sent() ) {
			return;
		}

		if ( null === $value ) {
			$value = self::build_cookie_value(
				array(
					'affiliate_id' => $affiliate,
					'click_id'     => $click_id,
				),
				$this->cookie_secret(),
				$expires
			);
		}

		setcookie(
			self::COOKIE_NAME,
			$value,
			array(
				'expires'  => (int) $expires,
				'path'     => defined( 'COOKIEPATH' ) && '' !== COOKIEPATH ? COOKIEPATH : '/',
				'domain'   => defined( 'COOKIE_DOMAIN' ) && COOKIE_DOMAIN ? COOKIE_DOMAIN : '',
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);

		// Make the value available to the rest of this request lifecycle.
		$_COOKIE[ self::COOKIE_NAME ] = $value;
	}

	/**
	 * Read and verify the current referral.
	 *
	 * @return array<string,mixed>|null
	 */
	public function get_referral() {
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Signature verified below.
		$raw = isset( $_COOKIE[ self::COOKIE_NAME ] ) ? wp_unslash( $_COOKIE[ self::COOKIE_NAME ] ) : '';

		return self::parse_cookie_value( $raw, $this->cookie_secret(), time() );
	}

	/**
	 * Secret used to sign the referral cookie.
	 *
	 * @return string
	 */
	private function cookie_secret() {
		$settings = $this->settings->get_settings();
		$material = (string) $settings['api_key'];

		if ( '' === $material ) {
			$material = 'stormsale-anonymous';
		}

		$salt = function_exists( 'wp_salt' ) ? wp_salt( 'auth' ) : '';

		return $material . '|' . $salt . '|' . get_site_url();
	}

	/**
	 * Queue an asynchronous click dispatch with short-lived de-duplication.
	 *
	 * @param array<string,mixed> $referral    Referral data.
	 * @param string              $landing_url Landing URL.
	 * @return void
	 */
	public function schedule_click( array $referral, $landing_url ) {
		$settings = $this->settings->get_settings();

		if ( ! StormSale_Settings::is_configured( $settings ) ) {
			return;
		}

		$payload = self::build_click_payload( $referral, $landing_url, $settings );

		$dedupe_key = self::CLICK_DEDUPE_PREFIX . md5( $payload['affiliate_id'] . '|' . $payload['click_id'] );

		if ( false !== get_transient( $dedupe_key ) ) {
			return;
		}

		set_transient( $dedupe_key, 1, self::CLICK_DEDUPE_SECONDS );

		if ( function_exists( 'as_enqueue_async_action' ) ) {
			as_enqueue_async_action( self::CLICK_RETRY_HOOK, array( $payload ), 'stormsale' );
			return;
		}

		if ( function_exists( 'as_schedule_single_action' ) ) {
			as_schedule_single_action( time(), self::CLICK_RETRY_HOOK, array( $payload ), 'stormsale' );
			return;
		}

		if ( function_exists( 'wp_schedule_single_event' ) ) {
			wp_schedule_single_event( time() + 1, self::CLICK_RETRY_HOOK, array( $payload ) );
		}
	}

	/**
	 * Dispatch a queued click to the gateway.
	 *
	 * @param array<string,mixed> $payload Click payload.
	 * @return void
	 */
	public function dispatch_click( $payload ) {
		if ( ! is_array( $payload ) || empty( $payload['affiliate_id'] ) ) {
			return;
		}

		$settings = $this->settings->get_settings();

		if ( 'yes' !== $settings['enable_click_tracking'] || ! StormSale_Settings::is_configured( $settings ) ) {
			return;
		}

		$client = StormSale_Api_Client::from_settings( $settings );
		$result = $client->post_click( $payload, 'click_' . $payload['click_id'] );

		StormSale_Plugin::log(
			sprintf(
				'Click dispatch for affiliate %1$s (status %2$s).',
				$payload['affiliate_id'],
				$result['success'] ? 'ok' : 'failed'
			)
		);
	}

	/**
	 * Persist the referral onto the WooCommerce order.
	 *
	 * Fires for both classic checkout and the Cart/Checkout blocks (Store API).
	 *
	 * @param mixed $order WooCommerce order object.
	 * @param mixed $data  Checkout data (unused).
	 * @return void
	 */
	public function attach_referral_to_order( $order, $data = null ) {
		unset( $data );

		if ( ! is_object( $order ) || ! method_exists( $order, 'update_meta_data' ) ) {
			return;
		}

		$referral = $this->get_referral();

		if ( null === $referral ) {
			return;
		}

		if ( method_exists( $order, 'get_meta' ) && $order->get_meta( self::META_AFFILIATE ) ) {
			return;
		}

		$settings = $this->settings->get_settings();

		$order->update_meta_data( self::META_AFFILIATE, $referral['affiliate_id'] );
		$order->update_meta_data( self::META_CLICK_ID, $referral['click_id'] );
		$order->update_meta_data( self::META_CAMPAIGN, (string) $settings['campaign_id'] );
		$order->update_meta_data( self::META_CAPTURED, gmdate( 'c' ) );

		if ( method_exists( $order, 'save' ) ) {
			$order->save();
		}
	}

	/**
	 * Register the public click beacon REST route.
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::REST_NAMESPACE,
			self::REST_ROUTE,
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'handle_click_request' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'affiliate_id' => array(
						'required' => true,
						'type'     => 'string',
					),
					'click_id'     => array(
						'required' => false,
						'type'     => 'string',
					),
					'landing_url'  => array(
						'required' => false,
						'type'     => 'string',
					),
					'referrer'     => array(
						'required' => false,
						'type'     => 'string',
					),
				),
			)
		);
	}

	/**
	 * Handle the click beacon.
	 *
	 * Requires the referral cookie set earlier in the same session, which proves
	 * the click originated from a page this store actually served.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function handle_click_request( $request ) {
		$settings = $this->settings->get_settings();

		if ( 'yes' !== $settings['enable_click_tracking'] || ! StormSale_Settings::is_configured( $settings ) ) {
			return new WP_REST_Response(
				array(
					'logged' => false,
					'reason' => 'tracking_disabled',
				),
				503
			);
		}

		$affiliate = self::normalize_affiliate_id( $request->get_param( 'affiliate_id' ) );
		$referral  = $this->get_referral();

		if ( '' === $affiliate || null === $referral ) {
			return new WP_REST_Response(
				array(
					'logged' => false,
					'reason' => 'invalid_referral',
				),
				403
			);
		}

		$click_id = self::normalize_click_id( $request->get_param( 'click_id' ) );

		if ( '' === $click_id ) {
			$click_id = $referral['click_id'];
		}

		if ( $referral['affiliate_id'] !== $affiliate ) {
			return new WP_REST_Response(
				array(
					'logged' => false,
					'reason' => 'affiliate_mismatch',
				),
				403
			);
		}

		$landing_url = esc_url_raw( (string) $request->get_param( 'landing_url' ) );

		if ( '' === $landing_url ) {
			$landing_url = self::current_request_url();
		}

		$this->schedule_click( $referral, $landing_url );

		return new WP_REST_Response(
			array(
				'logged'   => true,
				'click_id' => $click_id,
			),
			202
		);
	}

	/**
	 * Enqueue the referral tracking assets on the storefront.
	 *
	 * @return void
	 */
	public function enqueue_tracking_script() {
		if ( ! $this->is_enabled() ) {
			return;
		}

		wp_register_script(
			'stormsale-referral-core',
			STORMSALE_WC_URL . 'assets/js/ssw-referral-core.js',
			array(),
			STORMSALE_WC_VERSION,
			true
		);

		wp_enqueue_script(
			'stormsale-tracking',
			STORMSALE_WC_URL . 'assets/js/ssw-tracking.js',
			array( 'stormsale-referral-core' ),
			STORMSALE_WC_VERSION,
			true
		);

		$settings = $this->settings->get_settings();

		wp_localize_script(
			'stormsale-tracking',
			'StormSaleTracking',
			array(
				'clickEndpoint'  => esc_url_raw( rest_url( self::REST_NAMESPACE . self::REST_ROUTE ) ),
				'affiliateParam' => self::PARAM_AFFILIATE,
				'clickParam'     => self::PARAM_CLICK,
				'cookieName'     => self::COOKIE_NAME,
				'campaignId'     => (string) $settings['campaign_id'],
				'nonce'          => wp_create_nonce( 'wp_rest' ),
			)
		);
	}

	/* ---------------------------------------------------------------------
	 * Pure helpers (WordPress independent, unit tested directly).
	 * ------------------------------------------------------------------ */

	/**
	 * Build a signed cookie value.
	 *
	 * @param array  $data       Referral data (affiliate_id, click_id).
	 * @param string $secret     Signing secret.
	 * @param int    $expires_at Expiry timestamp.
	 * @return string
	 * @throws InvalidArgumentException When the affiliate id is invalid.
	 */
	public static function build_cookie_value( array $data, $secret, $expires_at ) {
		$affiliate = isset( $data['affiliate_id'] ) ? (string) $data['affiliate_id'] : '';
		$click_id  = isset( $data['click_id'] ) ? (string) $data['click_id'] : '';

		if ( ! self::validate_affiliate_id( $affiliate ) ) {
			throw new InvalidArgumentException( 'StormSale: invalid affiliate id for referral cookie.' );
		}

		if ( '' !== $click_id && '' === self::normalize_click_id( $click_id ) ) {
			throw new InvalidArgumentException( 'StormSale: invalid click id for referral cookie.' );
		}

		$expires_at = (int) $expires_at;
		$payload    = self::COOKIE_VERSION . '|' . $affiliate . '|' . $click_id . '|' . $expires_at;
		$signature  = StormSale_Crypto::sign( $payload, $secret, StormSale_Crypto::CONTEXT_COOKIE );

		return StormSale_Crypto::base64url_encode( $payload . '|' . $signature );
	}

	/**
	 * Verify and decode a referral cookie value.
	 *
	 * @param string   $raw    Raw cookie value.
	 * @param string   $secret Signing secret.
	 * @param int|null $now    Current timestamp.
	 * @return array<string,mixed>|null
	 */
	public static function parse_cookie_value( $raw, $secret, $now = null ) {
		if ( ! is_string( $raw ) || '' === $raw ) {
			return null;
		}

		$decoded = StormSale_Crypto::base64url_decode( $raw );

		if ( false === $decoded ) {
			return null;
		}

		$parts = explode( '|', $decoded );

		if ( 5 !== count( $parts ) ) {
			return null;
		}

		list( $version, $affiliate, $click_id, $expires_at, $signature ) = $parts;

		if ( self::COOKIE_VERSION !== $version ) {
			return null;
		}

		$payload = $version . '|' . $affiliate . '|' . $click_id . '|' . $expires_at;

		if ( ! StormSale_Crypto::verify_signature( $payload, $signature, $secret, StormSale_Crypto::CONTEXT_COOKIE ) ) {
			return null;
		}

		if ( ! self::validate_affiliate_id( $affiliate ) ) {
			return null;
		}

		$now = null === $now ? time() : (int) $now;

		if ( (int) $expires_at < $now ) {
			return null;
		}

		return array(
			'affiliate_id' => $affiliate,
			'click_id'     => $click_id,
			'expires_at'   => (int) $expires_at,
		);
	}

	/**
	 * Validate an affiliate identifier (Stellar public key or merchant slug).
	 *
	 * @param mixed $value Candidate value.
	 * @return bool
	 */
	public static function validate_affiliate_id( $value ) {
		return '' !== self::normalize_affiliate_id( $value );
	}

	/**
	 * Normalize an affiliate identifier, returning '' when invalid.
	 *
	 * @param mixed $value Candidate value.
	 * @return string
	 */
	public static function normalize_affiliate_id( $value ) {
		if ( ! is_string( $value ) ) {
			return '';
		}

		$value = trim( $value );

		if ( '' === $value || strlen( $value ) > 120 ) {
			return '';
		}

		if ( 1 === preg_match( '/^G[A-Z2-7]{55}$/', $value ) ) {
			return $value;
		}

		if ( 1 === preg_match( '/^[A-Za-z0-9](?:[A-Za-z0-9._:-]{1,118}[A-Za-z0-9])$/', $value ) ) {
			return $value;
		}

		return '';
	}

	/**
	 * Normalize a click identifier, returning '' when invalid.
	 *
	 * @param mixed $value Candidate value.
	 * @return string
	 */
	public static function normalize_click_id( $value ) {
		if ( ! is_string( $value ) ) {
			return '';
		}

		$value = trim( $value );

		if ( 1 === preg_match( '/^[A-Za-z0-9._:-]{1,120}$/', $value ) ) {
			return $value;
		}

		return '';
	}

	/**
	 * Build the click payload forwarded to the gateway.
	 *
	 * @param array $referral    Referral data.
	 * @param string $landing_url Landing URL.
	 * @param array $settings    Plugin settings.
	 * @return array<string,mixed>
	 */
	public static function build_click_payload( array $referral, $landing_url, array $settings ) {
		return array(
			'campaign_id'  => isset( $settings['campaign_id'] ) ? (string) $settings['campaign_id'] : '',
			'affiliate_id' => isset( $referral['affiliate_id'] ) ? (string) $referral['affiliate_id'] : '',
			'click_id'     => isset( $referral['click_id'] ) ? (string) $referral['click_id'] : '',
			'landing_url'  => (string) $landing_url,
			'clicked_at'   => gmdate( 'c' ),
			'source'       => 'woocommerce',
			'plugin'       => array(
				'name'    => 'stormsale-woocommerce',
				'version' => STORMSALE_WC_VERSION,
			),
		);
	}

	/**
	 * Best-effort reconstruction of the current request URL.
	 *
	 * @return string
	 */
	public static function current_request_url() {
		$host = isset( $_SERVER['HTTP_HOST'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) ) : '';
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';

		if ( '' === $host ) {
			return get_site_url();
		}

		return 'https://' . $host . $uri;
	}
}
