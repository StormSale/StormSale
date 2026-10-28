<?php
/**
 * HTTP client for transmitting encrypted conversion and click events.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Encrypts payloads and POSTs signed envelopes to the StormSale gateway.
 */
class StormSale_Api_Client {

	const EVENT_CONVERSION = 'conversion.confirmed';
	const EVENT_CLICK      = 'referral.clicked';

	/**
	 * Gateway endpoint URL.
	 *
	 * @var string
	 */
	private $gateway_url;

	/**
	 * Merchant API key.
	 *
	 * @var string
	 */
	private $api_key;

	/**
	 * Campaign identifier.
	 *
	 * @var string
	 */
	private $campaign_id;

	/**
	 * Request timeout in seconds.
	 *
	 * @var int
	 */
	private $timeout;

	/**
	 * Constructor.
	 *
	 * @param string $gateway_url Gateway endpoint.
	 * @param string $api_key     Merchant API key.
	 * @param string $campaign_id Campaign identifier.
	 * @param int    $timeout     Request timeout in seconds.
	 */
	public function __construct( $gateway_url, $api_key, $campaign_id, $timeout = 15 ) {
		$this->gateway_url = (string) $gateway_url;
		$this->api_key     = (string) $api_key;
		$this->campaign_id = (string) $campaign_id;
		$this->timeout     = max( 1, (int) $timeout );
	}

	/**
	 * Build a client from the stored merchant settings.
	 *
	 * @param array|null $settings Optional settings array.
	 * @return self
	 */
	public static function from_settings( $settings = null ) {
		$settings = is_array( $settings ) ? $settings : StormSale_Settings::get_settings();

		return new self(
			$settings['gateway_url'],
			$settings['api_key'],
			$settings['campaign_id']
		);
	}

	/**
	 * Transmit a verified conversion.
	 *
	 * @param array  $data            Order payload.
	 * @param string $idempotency_key Stable idempotency key.
	 * @return array<string,mixed>
	 */
	public function post_conversion( array $data, $idempotency_key ) {
		return $this->dispatch( self::EVENT_CONVERSION, $data, $idempotency_key );
	}

	/**
	 * Transmit a referral click.
	 *
	 * @param array  $data            Click payload.
	 * @param string $idempotency_key Stable idempotency key.
	 * @return array<string,mixed>
	 */
	public function post_click( array $data, $idempotency_key ) {
		return $this->dispatch( self::EVENT_CLICK, $data, $idempotency_key );
	}

	/**
	 * Build the canonical, decryptable request body.
	 *
	 * @param string $event           Event name.
	 * @param string $campaign_id     Campaign identifier.
	 * @param string $api_key         Merchant API key.
	 * @param array  $data            Plain data array.
	 * @param string $idempotency_key Idempotency key.
	 * @param string $sent_at         ISO-8601 timestamp.
	 * @return array<string,mixed>
	 */
	public static function build_request_body( $event, $campaign_id, $api_key, array $data, $idempotency_key, $sent_at ) {
		$plaintext = json_encode( $data );

		if ( false === $plaintext ) {
			$plaintext = '{}';
		}

		return array(
			'event'           => (string) $event,
			'campaign_id'     => (string) $campaign_id,
			'key_id'          => StormSale_Crypto::key_id( $api_key ),
			'idempotency_key' => (string) $idempotency_key,
			'sent_at'         => (string) $sent_at,
			'payload'         => StormSale_Crypto::encrypt( $plaintext, $api_key ),
		);
	}

	/**
	 * Compute the canonical signature string for a body.
	 *
	 * Format: timestamp . "\n" . idempotency_key . "\n" . raw_json_body
	 *
	 * @param string $body_json       Raw JSON body string.
	 * @param string $api_key         Merchant API key.
	 * @param string $timestamp       Unix timestamp (seconds).
	 * @param string $idempotency_key Idempotency key.
	 * @return string
	 */
	public static function signature_for( $body_json, $api_key, $timestamp, $idempotency_key ) {
		$canonical = $timestamp . "\n" . $idempotency_key . "\n" . $body_json;

		return StormSale_Crypto::sign( $canonical, $api_key );
	}

	/**
	 * Build the request headers for a signed dispatch.
	 *
	 * @param string $event           Event name.
	 * @param string $api_key         Merchant API key.
	 * @param string $campaign_id     Campaign identifier.
	 * @param string $signature       HMAC signature.
	 * @param int    $timestamp       Unix timestamp (seconds).
	 * @param string $idempotency_key Idempotency key.
	 * @return array<string,string>
	 */
	public static function build_headers( $event, $api_key, $campaign_id, $signature, $timestamp, $idempotency_key ) {
		return array(
			'Content-Type'                => 'application/json',
			'Accept'                      => 'application/json',
			'User-Agent'                  => 'StormSale-WooCommerce/' . STORMSALE_WC_VERSION . '; WordPress/' . get_bloginfo( 'version' ),
			'X-StormSale-Signature'       => 'sha256=' . $signature,
			'X-StormSale-Timestamp'       => (string) $timestamp,
			'X-StormSale-Event'           => (string) $event,
			'X-StormSale-Campaign'        => (string) $campaign_id,
			'X-StormSale-Key-Id'          => StormSale_Crypto::key_id( $api_key ),
			'X-StormSale-Idempotency-Key' => (string) $idempotency_key,
		);
	}

	/**
	 * Extract a Stellar transaction hash from a gateway response body.
	 *
	 * @param mixed $body Decoded response body.
	 * @return string
	 */
	public static function extract_tx_hash( $body ) {
		if ( ! is_array( $body ) ) {
			return '';
		}

		$candidates = array( 'tx_hash', 'stellar_tx_hash', 'transaction_hash', 'hash' );

		foreach ( $candidates as $candidate ) {
			if ( isset( $body[ $candidate ] ) && is_string( $body[ $candidate ] ) && '' !== trim( $body[ $candidate ] ) ) {
				return trim( $body[ $candidate ] );
			}
		}

		if ( isset( $body['data'] ) && is_array( $body['data'] ) ) {
			return self::extract_tx_hash( $body['data'] );
		}

		return '';
	}

	/**
	 * Perform the signed HTTP POST.
	 *
	 * @param string $event           Event name.
	 * @param array  $data            Plain data array.
	 * @param string $idempotency_key Idempotency key.
	 * @return array<string,mixed>
	 */
	private function dispatch( $event, array $data, $idempotency_key ) {
		$sent_at     = gmdate( 'c' );
		$timestamp   = time();

		try {
			$body       = self::build_request_body(
				$event,
				$this->campaign_id,
				$this->api_key,
				$data,
				$idempotency_key,
				$sent_at
			);
			$body_json  = json_encode( $body );
			$signature  = self::signature_for( $body_json, $this->api_key, $timestamp, $idempotency_key );
		} catch ( Exception $exception ) {
			return $this->error_result( $exception->getMessage() );
		}

		if ( false === $body_json ) {
			return $this->error_result( 'Unable to encode the encrypted request body.' );
		}

		$response = wp_remote_post(
			$this->gateway_url,
			array(
				'timeout'     => $this->timeout,
				'redirection' => 0,
				'headers'     => self::build_headers(
					$event,
					$this->api_key,
					$this->campaign_id,
					$signature,
					$timestamp,
					$idempotency_key
				),
				'body'        => $body_json,
			)
		);

		if ( is_wp_error( $response ) ) {
			return $this->error_result( $response->get_error_message() );
		}

		$status   = (int) wp_remote_retrieve_response_code( $response );
		$raw_body = (string) wp_remote_retrieve_body( $response );
		$decoded  = json_decode( $raw_body, true );
		$tx_hash  = self::extract_tx_hash( $decoded );

		$success = $status >= 200 && $status < 300;

		return array(
			'success'    => $success,
			'status'     => $status,
			'tx_hash'    => $tx_hash,
			'body'       => is_array( $decoded ) ? $decoded : array(),
			'raw'        => substr( $raw_body, 0, 2000 ),
			'error'      => $success ? '' : $this->describe_error( $status, $decoded, $raw_body ),
			'attempted_at' => $sent_at,
		);
	}

	/**
	 * Build a failed result array.
	 *
	 * @param string $message Error message.
	 * @return array<string,mixed>
	 */
	private function error_result( $message ) {
		return array(
			'success'      => false,
			'status'       => 0,
			'tx_hash'      => '',
			'body'         => array(),
			'raw'          => '',
			'error'        => (string) $message,
			'attempted_at' => gmdate( 'c' ),
		);
	}

	/**
	 * Produce a human readable error description.
	 *
	 * @param int   $status  HTTP status.
	 * @param mixed $decoded Decoded body.
	 * @param string $raw    Raw body.
	 * @return string
	 */
	private function describe_error( $status, $decoded, $raw ) {
		if ( is_array( $decoded ) ) {
			foreach ( array( 'error', 'message', 'detail' ) as $key ) {
				if ( ! empty( $decoded[ $key ] ) && is_string( $decoded[ $key ] ) ) {
					return 'HTTP ' . $status . ': ' . $decoded[ $key ];
				}
			}
		}

		$snippet = trim( (string) $raw );

		if ( '' === $snippet ) {
			return 'HTTP ' . $status . ': empty gateway response.';
		}

		return 'HTTP ' . $status . ': ' . substr( $snippet, 0, 200 );
	}
}
