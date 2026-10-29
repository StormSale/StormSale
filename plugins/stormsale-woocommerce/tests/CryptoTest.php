<?php
/**
 * Crypto primitive tests.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use PHPUnit\Framework\TestCase;

/**
 * Class CryptoTest
 */
class CryptoTest extends TestCase {

	/**
	 * API key used across the tests.
	 *
	 * @var string
	 */
	private $api_key = 'ss_test_api_key_0123456789';

	/**
	 * Encrypt/decrypt round trip preserves the plaintext.
	 */
	public function test_encrypt_decrypt_round_trip() {
		$plaintext = '{"order_id":42,"total":"199.00"}';
		$envelope  = StormSale_Crypto::encrypt( $plaintext, $this->api_key );

		$this->assertSame( 1, $envelope['v'] );
		$this->assertNotEmpty( $envelope['iv'] );
		$this->assertNotEmpty( $envelope['data'] );
		$this->assertNotSame( $plaintext, $envelope['data'] );
		$this->assertSame( $plaintext, StormSale_Crypto::decrypt( $envelope, $this->api_key ) );
	}

	/**
	 * AES-256-GCM (or the documented sodium fallback) is always selected.
	 */
	public function test_supported_cipher_is_used() {
		$envelope = StormSale_Crypto::encrypt( 'payload', $this->api_key );

		$this->assertContains(
			$envelope['alg'],
			array( StormSale_Crypto::CIPHER_OPENSSL, StormSale_Crypto::CIPHER_SODIUM )
		);
	}

	/**
	 * A different API key must not decrypt the envelope.
	 */
	public function test_decrypt_fails_with_wrong_key() {
		$envelope = StormSale_Crypto::encrypt( 'secret payload', $this->api_key );

		$this->expectException( RuntimeException::class );
		StormSale_Crypto::decrypt( $envelope, 'wrong_key' );
	}

	/**
	 * Tampered ciphertext fails authentication.
	 */
	public function test_decrypt_fails_on_tampered_ciphertext() {
		$envelope             = StormSale_Crypto::encrypt( 'secret payload', $this->api_key );
		$raw                  = base64_decode( $envelope['data'], true );
		$raw[0]               = chr( ord( $raw[0] ) ^ 0xff );
		$envelope['data']     = base64_encode( $raw );

		$this->expectException( RuntimeException::class );
		StormSale_Crypto::decrypt( $envelope, $this->api_key );
	}

	/**
	 * Malformed envelopes are rejected.
	 */
	public function test_decrypt_rejects_malformed_envelope() {
		$this->expectException( RuntimeException::class );
		StormSale_Crypto::decrypt( array(), $this->api_key );
	}

	/**
	 * Key derivation is deterministic and produces 32 bytes.
	 */
	public function test_derive_key_is_deterministic_and_sized() {
		$first  = StormSale_Crypto::derive_key( $this->api_key, StormSale_Crypto::CONTEXT_PAYLOAD );
		$second = StormSale_Crypto::derive_key( $this->api_key, StormSale_Crypto::CONTEXT_PAYLOAD );

		$this->assertSame( $first, $second );
		$this->assertSame( 32, strlen( $first ) );
		$this->assertNotSame( $first, StormSale_Crypto::derive_key( $this->api_key, StormSale_Crypto::CONTEXT_COOKIE ) );
	}

	/**
	 * An empty secret is rejected.
	 */
	public function test_derive_key_requires_a_secret() {
		$this->expectException( InvalidArgumentException::class );
		StormSale_Crypto::derive_key( '' );
	}

	/**
	 * Signatures are deterministic, verifiable and tamper evident.
	 */
	public function test_sign_and_verify_signature() {
		$payload   = '1700000000|idem-key|{"event":"conversion.confirmed"}';
		$signature = StormSale_Crypto::sign( $payload, $this->api_key );

		$this->assertSame( 64, strlen( $signature ) );
		$this->assertTrue( StormSale_Crypto::verify_signature( $payload, $signature, $this->api_key ) );
		$this->assertFalse( StormSale_Crypto::verify_signature( $payload . 'x', $signature, $this->api_key ) );
		$this->assertFalse( StormSale_Crypto::verify_signature( $payload, $signature, 'another-key' ) );
		$this->assertFalse( StormSale_Crypto::verify_signature( $payload, '', $this->api_key ) );
	}

	/**
	 * Key ids are stable, short and non-reversible.
	 */
	public function test_key_id_is_stable() {
		$key_id = StormSale_Crypto::key_id( $this->api_key );

		$this->assertSame( $key_id, StormSale_Crypto::key_id( $this->api_key ) );
		$this->assertSame( 12, strlen( $key_id ) );
		$this->assertStringNotContainsString( $this->api_key, $key_id );
		$this->assertNotSame( $key_id, StormSale_Crypto::key_id( 'other' ) );
	}

	/**
	 * UUID v4 format is correct.
	 */
	public function test_uuid_v4_format() {
		$uuid = StormSale_Crypto::uuid_v4();

		$this->assertSame( 1, preg_match( '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $uuid ) );
		$this->assertNotSame( $uuid, StormSale_Crypto::uuid_v4() );
	}

	/**
	 * Base64url helpers round trip binary data and avoid URL-reserved chars.
	 */
	public function test_base64url_round_trip() {
		$binary  = random_bytes( 32 );
		$encoded = StormSale_Crypto::base64url_encode( $binary );

		$this->assertSame( 1, preg_match( '/^[A-Za-z0-9_-]+$/', $encoded ) );
		$this->assertSame( $binary, StormSale_Crypto::base64url_decode( $encoded ) );
		$this->assertFalse( StormSale_Crypto::base64url_decode( '!!!not-base64!!!' ) );
	}
}
