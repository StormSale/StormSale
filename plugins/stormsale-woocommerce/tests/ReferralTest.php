<?php
/**
 * Referral cookie codec and validation tests.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use PHPUnit\Framework\TestCase;

/**
 * Class ReferralTest
 */
class ReferralTest extends TestCase {

	/**
	 * Test secret.
	 *
	 * @var string
	 */
	private $secret = 'ss_test_api_key_0123456789|salt|https://example.test';

	/**
	 * Affiliate identifiers are validated.
	 */
	public function test_affiliate_id_validation() {
		$this->assertTrue( StormSale_Referral::validate_affiliate_id( 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' ) );
		$this->assertTrue( StormSale_Referral::validate_affiliate_id( 'affiliate-42' ) );
		$this->assertTrue( StormSale_Referral::validate_affiliate_id( 'shop.partner_01' ) );

		$this->assertFalse( StormSale_Referral::validate_affiliate_id( '' ) );
		$this->assertFalse( StormSale_Referral::validate_affiliate_id( 'ab' ) );
		$this->assertFalse( StormSale_Referral::validate_affiliate_id( 'bad id with spaces' ) );
		$this->assertFalse( StormSale_Referral::validate_affiliate_id( '<script>' ) );
		$this->assertFalse( StormSale_Referral::validate_affiliate_id( str_repeat( 'a', 121 ) ) );
		$this->assertFalse( StormSale_Referral::validate_affiliate_id( array( 'not', 'a', 'string' ) ) );
	}

	/**
	 * Affiliate identifiers are normalized.
	 */
	public function test_affiliate_id_normalization() {
		$this->assertSame( 'affiliate-42', StormSale_Referral::normalize_affiliate_id( '  affiliate-42  ' ) );
		$this->assertSame( '', StormSale_Referral::normalize_affiliate_id( '   ' ) );
		$this->assertSame( '', StormSale_Referral::normalize_affiliate_id( 'bad id' ) );
	}

	/**
	 * Click identifiers are sanitized.
	 */
	public function test_click_id_sanitization() {
		$this->assertSame( 'click_123', StormSale_Referral::normalize_click_id( 'click_123' ) );
		$this->assertSame( 'a-b.c:d', StormSale_Referral::normalize_click_id( 'a-b.c:d' ) );
		$this->assertSame( '', StormSale_Referral::normalize_click_id( 'has space' ) );
		$this->assertSame( '', StormSale_Referral::normalize_click_id( str_repeat( 'a', 121 ) ) );
		$this->assertSame( '', StormSale_Referral::normalize_click_id( null ) );
	}

	/**
	 * A cookie can be built and parsed back.
	 */
	public function test_cookie_round_trip() {
		$expires = time() + 3600;
		$value   = StormSale_Referral::build_cookie_value(
			array(
				'affiliate_id' => 'affiliate-42',
				'click_id'     => 'click_1',
			),
			$this->secret,
			$expires
		);

		$parsed = StormSale_Referral::parse_cookie_value( $value, $this->secret );

		$this->assertIsArray( $parsed );
		$this->assertSame( 'affiliate-42', $parsed['affiliate_id'] );
		$this->assertSame( 'click_1', $parsed['click_id'] );
		$this->assertSame( $expires, $parsed['expires_at'] );
	}

	/**
	 * Tampered cookies are rejected.
	 */
	public function test_cookie_signature_is_enforced() {
		$expires = time() + 3600;
		$value   = StormSale_Referral::build_cookie_value(
			array(
				'affiliate_id' => 'affiliate-42',
				'click_id'     => 'click_1',
			),
			$this->secret,
			$expires
		);

		$tampered = StormSale_Crypto::base64url_encode( 'v1|affiliate-99|click_1|' . $expires . '|deadbeef' );

		$this->assertNull( StormSale_Referral::parse_cookie_value( $tampered, $this->secret ) );
		$this->assertNull( StormSale_Referral::parse_cookie_value( $value, 'another-secret' ) );
		$this->assertNull( StormSale_Referral::parse_cookie_value( 'not-base64', $this->secret ) );
	}

	/**
	 * Expired cookies are rejected.
	 */
	public function test_expired_cookie_is_rejected() {
		$expires = time() - 10;
		$value   = StormSale_Referral::build_cookie_value(
			array(
				'affiliate_id' => 'affiliate-42',
				'click_id'     => 'click_1',
			),
			$this->secret,
			$expires
		);

		$this->assertNull( StormSale_Referral::parse_cookie_value( $value, $this->secret ) );
	}

	/**
	 * Invalid affiliate ids cannot be encoded into a cookie.
	 */
	public function test_build_cookie_rejects_invalid_affiliate() {
		$this->expectException( InvalidArgumentException::class );
		StormSale_Referral::build_cookie_value( array( 'affiliate_id' => 'no spaces allowed' ), $this->secret, time() + 60 );
	}

	/**
	 * The click payload carries the campaign, affiliate and plugin context.
	 */
	public function test_build_click_payload() {
		$payload = StormSale_Referral::build_click_payload(
			array(
				'affiliate_id' => 'affiliate-42',
				'click_id'     => 'click_1',
			),
			'https://example.test/shop?ss_ref=affiliate-42',
			array( 'campaign_id' => 'campaign_7' )
		);

		$this->assertSame( 'campaign_7', $payload['campaign_id'] );
		$this->assertSame( 'affiliate-42', $payload['affiliate_id'] );
		$this->assertSame( 'click_1', $payload['click_id'] );
		$this->assertSame( 'woocommerce', $payload['source'] );
		$this->assertSame( 'stormsale-woocommerce', $payload['plugin']['name'] );
		$this->assertArrayHasKey( 'clicked_at', $payload );
	}
}
