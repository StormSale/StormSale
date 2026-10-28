<?php
/**
 * PHPUnit bootstrap: minimal WordPress/WooCommerce function stubs.
 *
 * The unit tests exercise pure, WordPress-independent logic (crypto, referral
 * cookie codec, payload builders and the HTTP client), so only a small subset of
 * WordPress functions needs to be defined.
 *
 * @package StormSale_WooCommerce
 */

define( 'ABSPATH', __DIR__ . '/' );

if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
}
if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
	define( 'HOUR_IN_SECONDS', 3600 );
}
if ( ! defined( 'DAY_IN_SECONDS' ) ) {
	define( 'DAY_IN_SECONDS', 86400 );
}
if ( ! defined( 'STORMSALE_WC_VERSION' ) ) {
	define( 'STORMSALE_WC_VERSION', '1.0.0' );
}
if ( ! defined( 'STORMSALE_WC_BASENAME' ) ) {
	define( 'STORMSALE_WC_BASENAME', 'stormsale-woocommerce/stormsale-woocommerce.php' );
}

if ( ! class_exists( 'WP_Error' ) ) {
	/**
	 * Minimal WP_Error test double.
	 */
	class WP_Error {

		/**
		 * Error code.
		 *
		 * @var string
		 */
		public $code;

		/**
		 * Error message.
		 *
		 * @var string
		 */
		public $message;

		/**
		 * Constructor.
		 *
		 * @param string $code    Error code.
		 * @param string $message Error message.
		 */
		public function __construct( $code = '', $message = '' ) {
			$this->code    = $code;
			$this->message = $message;
		}

		/**
		 * Retrieve the error message.
		 *
		 * @return string
		 */
		public function get_error_message() {
			return $this->message;
		}
	}
}

if ( ! function_exists( 'is_wp_error' ) ) {
	/**
	 * Whether a value is a WP_Error.
	 *
	 * @param mixed $thing Value to inspect.
	 * @return bool
	 */
	function is_wp_error( $thing ) {
		return $thing instanceof WP_Error;
	}
}

if ( ! function_exists( 'get_bloginfo' ) ) {
	/**
	 * Stub for get_bloginfo().
	 *
	 * @param string $key Info key.
	 * @return string
	 */
	function get_bloginfo( $key = '' ) {
		return 'version' === $key ? '6.6' : 'StormSale Test Store';
	}
}

if ( ! function_exists( 'get_site_url' ) ) {
	/**
	 * Stub for get_site_url().
	 *
	 * @return string
	 */
	function get_site_url() {
		return 'https://example.test';
	}
}

if ( ! function_exists( 'wp_json_encode' ) ) {
	/**
	 * Stub for wp_json_encode().
	 *
	 * @param mixed $data Data.
	 * @return string|false
	 */
	function wp_json_encode( $data ) {
		return json_encode( $data );
	}
}

if ( ! function_exists( 'wp_remote_post' ) ) {
	/**
	 * Stub for wp_remote_post() driven by $GLOBALS['stormsale_test_http_response'].
	 *
	 * @param string $url  Request URL.
	 * @param array  $args Request arguments.
	 * @return array|WP_Error
	 */
	function wp_remote_post( $url, $args = array() ) {
		$GLOBALS['stormsale_test_last_request'] = array(
			'url'  => $url,
			'args' => $args,
		);

		if ( isset( $GLOBALS['stormsale_test_http_response'] ) ) {
			return $GLOBALS['stormsale_test_http_response'];
		}

		return array(
			'response' => array( 'code' => 200 ),
			'body'     => '{}',
		);
	}
}

if ( ! function_exists( 'wp_remote_retrieve_response_code' ) ) {
	/**
	 * Stub for wp_remote_retrieve_response_code().
	 *
	 * @param array $response HTTP response.
	 * @return int
	 */
	function wp_remote_retrieve_response_code( $response ) {
		return isset( $response['response']['code'] ) ? (int) $response['response']['code'] : 0;
	}
}

if ( ! function_exists( 'wp_remote_retrieve_body' ) ) {
	/**
	 * Stub for wp_remote_retrieve_body().
	 *
	 * @param array $response HTTP response.
	 * @return string
	 */
	function wp_remote_retrieve_body( $response ) {
		return isset( $response['body'] ) ? (string) $response['body'] : '';
	}
}

if ( ! function_exists( 'get_option' ) ) {
	/**
	 * In-memory option store used by tests.
	 *
	 * @param string $name    Option name.
	 * @param mixed  $default Default value.
	 * @return mixed
	 */
	function get_option( $name, $default = false ) {
		return array_key_exists( $name, $GLOBALS['stormsale_test_options'] ?? array() )
			? $GLOBALS['stormsale_test_options'][ $name ]
			: $default;
	}
}

if ( ! function_exists( 'update_option' ) ) {
	/**
	 * Persist a value in the in-memory option store.
	 *
	 * @param string $name  Option name.
	 * @param mixed  $value Option value.
	 * @return bool
	 */
	function update_option( $name, $value ) {
		if ( ! isset( $GLOBALS['stormsale_test_options'] ) ) {
			$GLOBALS['stormsale_test_options'] = array();
		}

		$GLOBALS['stormsale_test_options'][ $name ] = $value;

		return true;
	}
}

if ( ! function_exists( 'sanitize_text_field' ) ) {
	/**
	 * Stub for sanitize_text_field().
	 *
	 * @param string $value Value.
	 * @return string
	 */
	function sanitize_text_field( $value ) {
		return trim( strip_tags( (string) $value ) );
	}
}

if ( ! function_exists( 'wp_unslash' ) ) {
	/**
	 * Stub for wp_unslash().
	 *
	 * @param mixed $value Value.
	 * @return mixed
	 */
	function wp_unslash( $value ) {
		return $value;
	}
}

require_once dirname( __DIR__ ) . '/includes/class-stormsale-crypto.php';
require_once dirname( __DIR__ ) . '/includes/class-stormsale-settings.php';
require_once dirname( __DIR__ ) . '/includes/class-stormsale-api-client.php';
require_once dirname( __DIR__ ) . '/includes/class-stormsale-referral.php';
require_once dirname( __DIR__ ) . '/includes/class-stormsale-conversion.php';
