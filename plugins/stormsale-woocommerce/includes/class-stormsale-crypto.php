<?php
/**
 * Authenticated encryption and request signing primitives.
 *
 * All methods are pure (WordPress independent) so they can be unit tested in
 * isolation and reused by the API client, referral codec and conversion logger.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * AES-256-GCM (with XChaCha20-Poly1305 fallback) encryption and HMAC signing.
 */
class StormSale_Crypto {

	const CIPHER_OPENSSL = 'AES-256-GCM';
	const CIPHER_SODIUM  = 'XChaCha20-Poly1305';

	const CONTEXT_PAYLOAD   = 'payload';
	const CONTEXT_COOKIE    = 'cookie';
	const CONTEXT_SIGNATURE = 'signature';

	const ENVELOPE_VERSION = 1;
	const AAD              = 'stormsale-woocommerce:v1';

	/**
	 * Derive a 32-byte key from an arbitrary secret using HKDF-SHA256.
	 *
	 * @param string $secret  Raw secret (API key or WordPress salt).
	 * @param string $context Derivation context to keep keys separated.
	 * @return string 32 raw bytes.
	 * @throws InvalidArgumentException When the secret is empty.
	 */
	public static function derive_key( $secret, $context = self::CONTEXT_PAYLOAD ) {
		$secret = (string) $secret;

		if ( '' === $secret ) {
			throw new InvalidArgumentException( 'StormSale: encryption secret must not be empty.' );
		}

		return hash_hkdf( 'sha256', $secret, 32, 'stormsale-wc-' . $context );
	}

	/**
	 * Whether OpenSSL exposes AES-256-GCM on this host.
	 *
	 * @return bool
	 */
	public static function openssl_gcm_available() {
		if ( ! function_exists( 'openssl_encrypt' ) || ! function_exists( 'openssl_get_cipher_methods' ) ) {
			return false;
		}

		$ciphers = openssl_get_cipher_methods();

		return in_array( strtolower( self::CIPHER_OPENSSL ), array_map( 'strtolower', $ciphers ), true );
	}

	/**
	 * Whether libsodium XChaCha20-Poly1305 is available as a fallback.
	 *
	 * @return bool
	 */
	public static function sodium_available() {
		return function_exists( 'sodium_crypto_aead_xchacha20poly1305_ietf_encrypt' );
	}

	/**
	 * Encrypt a plaintext string with the merchant API key.
	 *
	 * @param string $plaintext Raw JSON/text payload.
	 * @param string $secret    Merchant API key.
	 * @return array{ v:int, alg:string, iv:string, tag:string, data:string }
	 * @throws RuntimeException When no supported AEAD extension exists.
	 */
	public static function encrypt( $plaintext, $secret ) {
		$plaintext = (string) $plaintext;
		$key       = self::derive_key( $secret, self::CONTEXT_PAYLOAD );

		if ( self::openssl_gcm_available() ) {
			$iv  = random_bytes( 12 );
			$tag = '';

			$ciphertext = openssl_encrypt(
				$plaintext,
				self::CIPHER_OPENSSL,
				$key,
				OPENSSL_RAW_DATA,
				$iv,
				$tag,
				self::AAD,
				16
			);

			if ( false === $ciphertext ) {
				throw new RuntimeException( 'StormSale: AES-256-GCM encryption failed.' );
			}

			return array(
				'v'    => self::ENVELOPE_VERSION,
				'alg'  => self::CIPHER_OPENSSL,
				'iv'   => base64_encode( $iv ),
				'tag'  => base64_encode( $tag ),
				'data' => base64_encode( $ciphertext ),
			);
		}

		if ( self::sodium_available() ) {
			$nonce = random_bytes( SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES );

			$ciphertext = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt(
				$plaintext,
				self::AAD,
				$nonce,
				$key
			);

			return array(
				'v'    => self::ENVELOPE_VERSION,
				'alg'  => self::CIPHER_SODIUM,
				'iv'   => base64_encode( $nonce ),
				'tag'  => '',
				'data' => base64_encode( $ciphertext ),
			);
		}

		throw new RuntimeException(
			'StormSale: neither OpenSSL AES-256-GCM nor libsodium XChaCha20-Poly1305 is available on this host.'
		);
	}

	/**
	 * Decrypt an envelope produced by {@see self::encrypt()}.
	 *
	 * @param array  $envelope Encryption envelope.
	 * @param string $secret   Merchant API key.
	 * @return string Plaintext.
	 * @throws RuntimeException When the envelope is malformed or the tag fails.
	 */
	public static function decrypt( array $envelope, $secret ) {
		if ( empty( $envelope['alg'] ) || ! isset( $envelope['iv'], $envelope['data'] ) ) {
			throw new RuntimeException( 'StormSale: malformed encryption envelope.' );
		}

		$key  = self::derive_key( $secret, self::CONTEXT_PAYLOAD );
		$iv   = base64_decode( (string) $envelope['iv'], true );
		$data = base64_decode( (string) $envelope['data'], true );

		if ( false === $iv || false === $data ) {
			throw new RuntimeException( 'StormSale: envelope is not valid base64.' );
		}

		if ( self::CIPHER_OPENSSL === $envelope['alg'] ) {
			if ( ! self::openssl_gcm_available() ) {
				throw new RuntimeException( 'StormSale: OpenSSL AES-256-GCM is unavailable.' );
			}

			$tag  = isset( $envelope['tag'] ) ? base64_decode( (string) $envelope['tag'], true ) : false;
			$tag  = false === $tag ? '' : $tag;
			$plain = openssl_decrypt( $data, self::CIPHER_OPENSSL, $key, OPENSSL_RAW_DATA, $iv, $tag, self::AAD );

			if ( false === $plain ) {
				throw new RuntimeException( 'StormSale: authentication tag verification failed.' );
			}

			return $plain;
		}

		if ( self::CIPHER_SODIUM === $envelope['alg'] ) {
			if ( ! self::sodium_available() ) {
				throw new RuntimeException( 'StormSale: libsodium XChaCha20-Poly1305 is unavailable.' );
			}

			$plain = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt( $data, self::AAD, $iv, $key );

			if ( false === $plain ) {
				throw new RuntimeException( 'StormSale: authentication tag verification failed.' );
			}

			return $plain;
		}

		throw new RuntimeException( 'StormSale: unsupported cipher "' . (string) $envelope['alg'] . '".' );
	}

	/**
	 * Compute an HMAC-SHA256 signature over a canonical payload.
	 *
	 * @param string $payload   Canonical string.
	 * @param string $secret    Merchant API key.
	 * @param string $context   Signing context.
	 * @return string Lowercase hex signature.
	 */
	public static function sign( $payload, $secret, $context = self::CONTEXT_SIGNATURE ) {
		$key = self::derive_key( $secret, $context );

		return hash_hmac( 'sha256', (string) $payload, $key );
	}

	/**
	 * Constant-time signature verification.
	 *
	 * @param string $payload   Canonical string.
	 * @param string $signature Candidate signature.
	 * @param string $secret    Merchant API key.
	 * @param string $context   Signing context.
	 * @return bool
	 */
	public static function verify_signature( $payload, $signature, $secret, $context = self::CONTEXT_SIGNATURE ) {
		if ( ! is_string( $signature ) || '' === $signature ) {
			return false;
		}

		try {
			$expected = self::sign( $payload, $secret, $context );
		} catch ( InvalidArgumentException $exception ) {
			unset( $exception );
			return false;
		}

		return hash_equals( $expected, $signature );
	}

	/**
	 * Stable, non-reversible identifier for an API key (safe to transmit).
	 *
	 * @param string $secret Merchant API key.
	 * @return string 12 hex characters.
	 */
	public static function key_id( $secret ) {
		return substr( hash_hmac( 'sha256', 'stormsale-key-id', (string) $secret ), 0, 12 );
	}

	/**
	 * RFC 4122 version 4 UUID.
	 *
	 * @return string
	 */
	public static function uuid_v4() {
		$bytes    = random_bytes( 16 );
		$bytes[6] = chr( ( ord( $bytes[6] ) & 0x0f ) | 0x40 );
		$bytes[8] = chr( ( ord( $bytes[8] ) & 0x3f ) | 0x80 );

		return vsprintf(
			'%s%s-%s-%s-%s-%s%s%s',
			str_split( bin2hex( $bytes ), 4 )
		);
	}

	/**
	 * Base64url encode a binary string (cookie / header safe).
	 *
	 * @param string $value Raw value.
	 * @return string
	 */
	public static function base64url_encode( $value ) {
		return rtrim( strtr( base64_encode( (string) $value ), '+/', '-_' ), '=' );
	}

	/**
	 * Decode a base64url string.
	 *
	 * @param string $value Encoded value.
	 * @return string|false
	 */
	public static function base64url_decode( $value ) {
		$value = strtr( (string) $value, '-_', '+/' );
		$pad   = strlen( $value ) % 4;

		if ( 0 !== $pad ) {
			$value .= str_repeat( '=', 4 - $pad );
		}

		return base64_decode( $value, true );
	}
}
