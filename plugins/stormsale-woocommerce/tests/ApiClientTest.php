<?php
/**
 * Gateway HTTP client tests.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use PHPUnit\Framework\TestCase;

/**
 * Class ApiClientTest
 */
class ApiClientTest extends TestCase {

	/**
	 * API key.
	 *
	 * @var string
	 */
	private $api_key = 'ss_test_api_key_0123456789';

	/**
	 * Campaign id.
	 *
	 * @var string
	 */
	private $campaign = 'campaign_7';

	/**
	 * Reset the canned HTTP response before each test.
	 *
	 * @return void
	 */
	protected function setUp(): void {
		$GLOBALS['stormsale_test_http_response'] = array(
			'response' => array( 'code' => 200 ),
			'body'     => '{"status":"ok","tx_hash":"abc123"}',
		);
		unset( $GLOBALS['stormsale_test_last_request'] );
	}

	/**
	 * Build a client under test.
	 *
	 * @return StormSale_Api_Client
	 */
	private function client() {
		return new StormSale_Api_Client( 'https://gateway.example.test/conversions', $this->api_key, $this->campaign );
	}

	/**
	 * The request body is decryptable with the merchant API key.
	 */
	public function test_request_body_is_encrypted_and_decryptable() {
		$data = array( 'order_id' => 42, 'total' => '199.00' );
		$body = StormSale_Api_Client::build_request_body(
			StormSale_Api_Client::EVENT_CONVERSION,
			$this->campaign,
			$this->api_key,
			$data,
			'idem-1',
			'2024-01-01T00:00:00+00:00'
		);

		$this->assertSame( StormSale_Api_Client::EVENT_CONVERSION, $body['event'] );
		$this->assertSame( $this->campaign, $body['campaign_id'] );
		$this->assertSame( 'idem-1', $body['idempotency_key'] );
		$this->assertSame( StormSale_Crypto::key_id( $this->api_key ), $body['key_id'] );
		$this->assertNotContains( 'order_id', wp_json_encode( $body ) );

		$plaintext = StormSale_Crypto::decrypt( $body['payload'], $this->api_key );

		$this->assertSame( $data, json_decode( $plaintext, true ) );
	}

	/**
	 * Signatures are computed over the canonical string and verifiable.
	 */
	public function test_signature_is_verifiable() {
		$json      = '{"event":"conversion.confirmed"}';
		$timestamp = 1700000000;
		$idem      = 'idem-1';
		$signature = StormSale_Api_Client::signature_for( $json, $this->api_key, $timestamp, $idem );
		$canonical = $timestamp . "\n" . $idem . "\n" . $json;

		$this->assertTrue( StormSale_Crypto::verify_signature( $canonical, $signature, $this->api_key ) );
		$this->assertFalse( StormSale_Crypto::verify_signature( $canonical . 'x', $signature, $this->api_key ) );
	}

	/**
	 * Headers contain every StormSale protocol field.
	 */
	public function test_build_headers() {
		$headers = StormSale_Api_Client::build_headers(
			StormSale_Api_Client::EVENT_CLICK,
			$this->api_key,
			$this->campaign,
			'deadbeef',
			1700000000,
			'idem-1'
		);

		$this->assertSame( 'sha256=deadbeef', $headers['X-StormSale-Signature'] );
		$this->assertSame( '1700000000', $headers['X-StormSale-Timestamp'] );
		$this->assertSame( StormSale_Api_Client::EVENT_CLICK, $headers['X-StormSale-Event'] );
		$this->assertSame( $this->campaign, $headers['X-StormSale-Campaign'] );
		$this->assertSame( 'idem-1', $headers['X-StormSale-Idempotency-Key'] );
		$this->assertSame( StormSale_Crypto::key_id( $this->api_key ), $headers['X-StormSale-Key-Id'] );
		$this->assertSame( 'application/json', $headers['Content-Type'] );
	}

	/**
	 * A successful dispatch returns the ledger transaction hash.
	 */
	public function test_successful_dispatch_returns_tx_hash() {
		$result = $this->client()->post_conversion( array( 'order_id' => 42 ), 'idem-1' );

		$this->assertTrue( $result['success'] );
		$this->assertSame( 200, $result['status'] );
		$this->assertSame( 'abc123', $result['tx_hash'] );
		$this->assertSame( '', $result['error'] );

		$request = $GLOBALS['stormsale_test_last_request'];
		$this->assertSame( 'https://gateway.example.test/conversions', $request['url'] );
		$this->assertArrayHasKey( 'X-StormSale-Signature', $request['args']['headers'] );
		$this->assertIsArray( json_decode( $request['args']['body'], true ) );
	}

	/**
	 * HTTP failures are reported with a descriptive error.
	 */
	public function test_http_error_is_reported() {
		$GLOBALS['stormsale_test_http_response'] = array(
			'response' => array( 'code' => 500 ),
			'body'     => '{"error":"ledger unavailable"}',
		);

		$result = $this->client()->post_conversion( array( 'order_id' => 42 ), 'idem-1' );

		$this->assertFalse( $result['success'] );
		$this->assertSame( 500, $result['status'] );
		$this->assertStringContainsString( 'ledger unavailable', $result['error'] );
		$this->assertSame( '', $result['tx_hash'] );
	}

	/**
	 * A transport failure (WP_Error) is surfaced without an exception.
	 */
	public function test_transport_error_is_handled() {
		$GLOBALS['stormsale_test_http_response'] = new WP_Error( 'http_request_failed', 'cURL error 28' );

		$result = $this->client()->post_click( array( 'click_id' => 'click_1' ), 'click_click_1' );

		$this->assertFalse( $result['success'] );
		$this->assertSame( 0, $result['status'] );
		$this->assertStringContainsString( 'cURL error 28', $result['error'] );
	}

	/**
	 * Transaction hashes are discovered in nested response shapes.
	 */
	public function test_extract_tx_hash() {
		$this->assertSame( 'aaa', StormSale_Api_Client::extract_tx_hash( array( 'tx_hash' => 'aaa' ) ) );
		$this->assertSame( 'bbb', StormSale_Api_Client::extract_tx_hash( array( 'data' => array( 'stellar_tx_hash' => 'bbb' ) ) ) );
		$this->assertSame( '', StormSale_Api_Client::extract_tx_hash( array( 'status' => 'ok' ) ) );
		$this->assertSame( '', StormSale_Api_Client::extract_tx_hash( 'not-an-array' ) );
	}

	/**
	 * The client can be constructed from stored settings.
	 */
	public function test_from_settings() {
		$client = StormSale_Api_Client::from_settings(
			array(
				'gateway_url' => 'https://gateway.example.test/conversions',
				'api_key'     => $this->api_key,
				'campaign_id' => $this->campaign,
			)
		);

		$result = $client->post_conversion( array( 'order_id' => 1 ), 'idem-2' );

		$this->assertTrue( $result['success'] );
	}
}
