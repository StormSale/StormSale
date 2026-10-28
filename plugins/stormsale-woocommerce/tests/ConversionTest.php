<?php
/**
 * Conversion payload and retry strategy tests.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use PHPUnit\Framework\TestCase;

/**
 * Class ConversionTest
 */
class ConversionTest extends TestCase {

	/**
	 * Sample normalized order data.
	 *
	 * @return array<string,mixed>
	 */
	private function order() {
		return array(
			'id'              => 42,
			'number'          => '42',
			'order_key'       => 'wc_order_secret_key',
			'status'          => 'processing',
			'currency'        => 'USD',
			'total'           => '199.00',
			'subtotal'        => '189.00',
			'total_tax'       => '10.00',
			'shipping_total'  => '0.00',
			'payment_method'  => 'stripe',
			'created_at'      => '2024-01-01T10:00:00+00:00',
			'customer_email'  => 'buyer@example.test',
			'customer_name'   => 'Ada Lovelace',
			'billing_country' => 'US',
			'items'           => array(
				array(
					'item_id'    => 1,
					'product_id' => 7,
					'name'       => 'Widget',
					'quantity'   => 2,
					'line_total' => '189.00',
				),
			),
		);
	}

	/**
	 * Sample referral context.
	 *
	 * @return array<string,mixed>
	 */
	private function context() {
		return array(
			'event_id'     => '0f6f4d4c-1111-4222-8333-444455556666',
			'campaign_id'  => 'campaign_7',
			'affiliate_id' => 'affiliate-42',
			'click_id'     => 'click_1',
			'store_url'    => 'https://example.test',
			'store_name'   => 'Example Store',
			'occurred_at'  => '2024-01-01T10:05:00+00:00',
		);
	}

	/**
	 * The payload exposes the attributes the campaign requires.
	 */
	public function test_build_payload() {
		$payload = StormSale_Conversion::build_payload( $this->order(), $this->context() );

		$this->assertSame( '0f6f4d4c-1111-4222-8333-444455556666', $payload['event_id'] );
		$this->assertSame( 'order.completed', $payload['event'] );
		$this->assertSame( 'campaign_7', $payload['campaign']['id'] );
		$this->assertSame( 'affiliate-42', $payload['affiliate']['id'] );
		$this->assertSame( 'click_1', $payload['affiliate']['click_id'] );
		$this->assertSame( 42, $payload['order']['id'] );
		$this->assertSame( '199.00', $payload['order']['total'] );
		$this->assertSame( 'USD', $payload['order']['currency'] );
		$this->assertCount( 1, $payload['order']['items'] );
		$this->assertSame( 'buyer@example.test', $payload['customer']['email'] );
		$this->assertSame( 'Example Store', $payload['store']['name'] );
	}

	/**
	 * The raw order key is never transmitted in plaintext.
	 */
	public function test_payload_hashes_the_order_key() {
		$payload = StormSale_Conversion::build_payload( $this->order(), $this->context() );

		$this->assertArrayNotHasKey( 'key', $payload['order'] );
		$this->assertSame( StormSale_Conversion::hash_value( 'wc_order_secret_key' ), $payload['order']['key_hash'] );
		$this->assertStringNotContainsString( 'wc_order_secret_key', wp_json_encode( $payload ) );
	}

	/**
	 * Missing order fields fall back to safe defaults.
	 */
	public function test_build_payload_tolerates_missing_fields() {
		$payload = StormSale_Conversion::build_payload( array(), array() );

		$this->assertSame( 0, $payload['order']['id'] );
		$this->assertSame( '', $payload['affiliate']['id'] );
		$this->assertSame( array(), $payload['order']['items'] );
		$this->assertSame( 'order.completed', $payload['event'] );
	}

	/**
	 * Idempotency keys are stable and keyed by the order.
	 */
	public function test_idempotency_key_is_stable() {
		$first  = StormSale_Conversion::idempotency_key( 42, 'wc_order_secret_key' );
		$second = StormSale_Conversion::idempotency_key( 42, 'wc_order_secret_key' );
		$other  = StormSale_Conversion::idempotency_key( 43, 'wc_order_secret_key' );

		$this->assertSame( $first, $second );
		$this->assertNotSame( $first, $other );
		$this->assertStringStartsWith( 'wc_42_', $first );
		$this->assertStringNotContainsString( 'wc_order_secret_key', $first );
	}

	/**
	 * Retry delays follow exponential backoff and are capped.
	 */
	public function test_retry_delay_backoff() {
		$this->assertSame( 300, StormSale_Conversion::retry_delay( 1 ) );
		$this->assertSame( 600, StormSale_Conversion::retry_delay( 2 ) );
		$this->assertSame( 1200, StormSale_Conversion::retry_delay( 3 ) );
		$this->assertSame( 21600, StormSale_Conversion::retry_delay( 20 ) );
	}

	/**
	 * Hashing is non-reversible and empty-safe.
	 */
	public function test_hash_value() {
		$this->assertSame( '', StormSale_Conversion::hash_value( '' ) );
		$this->assertSame( 64, strlen( StormSale_Conversion::hash_value( 'value' ) ) );
		$this->assertNotSame( StormSale_Conversion::hash_value( 'a' ), StormSale_Conversion::hash_value( 'b' ) );
	}
}
