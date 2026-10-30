<?php
/**
 * Converts completed WooCommerce orders into verified StormSale ledger entries.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Listens for completed payments, encrypts the order payload and transmits it to
 * the StormSale gateway, retrying with exponential backoff until the ledger
 * confirms the conversion.
 */
class StormSale_Conversion {

	const RETRY_HOOK = 'stormsale_dispatch_conversion';
	const MAX_ATTEMPTS = 5;
	const BASE_RETRY_SECONDS = 300;
	const MAX_RETRY_SECONDS = 21600;

	const STATUS_QUEUED   = 'queued';
	const STATUS_RETRYING = 'retrying';
	const STATUS_SENT     = 'sent';
	const STATUS_VERIFIED = 'verified';
	const STATUS_FAILED   = 'failed';

	const META_STATUS      = '_stormsale_conversion_status';
	const META_TX_HASH     = '_stormsale_ledger_tx_hash';
	const META_ATTEMPTS    = '_stormsale_conversion_attempts';
	const META_EVENT_ID    = '_stormsale_event_id';
	const META_LAST_ERROR  = '_stormsale_last_error';
	const META_VERIFIED_AT = '_stormsale_verified_at';
	const META_RESPONSE    = '_stormsale_last_response';

	/**
	 * Settings service.
	 *
	 * @var StormSale_Settings
	 */
	private $settings;

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
		add_action( 'woocommerce_payment_complete', array( $this, 'on_payment_complete' ), 10, 1 );
		add_action( self::RETRY_HOOK, array( $this, 'dispatch_conversion' ), 10, 1 );

		add_filter( 'woocommerce_order_actions', array( $this, 'register_order_action' ) );
		add_action( 'woocommerce_order_action_stormsale_resend_conversion', array( $this, 'on_manual_resend' ) );
	}

	/**
	 * Whether conversion logging is enabled and configured.
	 *
	 * @return bool
	 */
	public function is_enabled() {
		$settings = $this->settings->get_settings();

		return 'yes' === $settings['enable_conversion_logging'] && StormSale_Settings::is_configured( $settings );
	}

	/**
	 * Handle a completed payment.
	 *
	 * @param int $order_id WooCommerce order id.
	 * @return void
	 */
	public function on_payment_complete( $order_id ) {
		if ( ! $this->is_enabled() ) {
			return;
		}

		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return;
		}

		$status = (string) $order->get_meta( self::META_STATUS );

		if ( in_array( $status, array( self::STATUS_QUEUED, self::STATUS_RETRYING, self::STATUS_VERIFIED ), true ) ) {
			return;
		}

		$order->update_meta_data( self::META_STATUS, self::STATUS_QUEUED );
		$order->update_meta_data( self::META_ATTEMPTS, 0 );
		$order->update_meta_data( self::META_EVENT_ID, StormSale_Crypto::uuid_v4() );
		$order->save();

		$this->dispatch_conversion( $order_id );
	}

	/**
	 * Transmit (or retry) an encrypted conversion for an order.
	 *
	 * @param int $order_id WooCommerce order id.
	 * @return void
	 */
	public function dispatch_conversion( $order_id ) {
		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return;
		}

		if ( self::STATUS_VERIFIED === (string) $order->get_meta( self::META_STATUS ) ) {
			return;
		}

		if ( ! $this->is_enabled() ) {
			return;
		}

		$settings = $this->settings->get_settings();
		$payload  = self::build_payload(
			self::collect_order_data( $order ),
			self::build_context( $order, $settings )
		);

		$client = StormSale_Api_Client::from_settings( $settings );
		$result = $client->post_conversion( $payload, self::idempotency_key( $order_id, (string) $order->get_order_key() ) );

		$attempts = (int) $order->get_meta( self::META_ATTEMPTS ) + 1;
		$order->update_meta_data( self::META_ATTEMPTS, $attempts );
		$order->update_meta_data( self::META_RESPONSE, isset( $result['raw'] ) ? (string) $result['raw'] : '' );

		update_option( StormSale_Settings::OPTION_LAST_STATUS, $result['success'] ? 'ok' : 'error' );
		update_option( StormSale_Settings::OPTION_LAST_ATTEMPT_AT, gmdate( 'c' ) );

		if ( $result['success'] && '' !== $result['tx_hash'] ) {
			$this->mark_verified( $order, $result );

			return;
		}

		if ( $result['success'] ) {
			$order->update_meta_data( self::META_STATUS, self::STATUS_SENT );
			$order->update_meta_data( self::META_LAST_ERROR, '' );
			$order->save();
			$this->persist_success_meta( $result );

			$order->add_order_note(
				__( 'StormSale: conversion accepted by the gateway, awaiting ledger confirmation.', 'stormsale-woocommerce' )
			);

			return;
		}

		$order->update_meta_data( self::META_LAST_ERROR, $result['error'] );
		update_option( StormSale_Settings::OPTION_LAST_ERROR, $result['error'] );

		if ( $attempts >= self::MAX_ATTEMPTS ) {
			$order->update_meta_data( self::META_STATUS, self::STATUS_FAILED );
			$order->save();

			$order->add_order_note(
				sprintf(
					/* translators: 1: number of attempts, 2: error message. */
					__( 'StormSale: conversion failed after %1$d attempts. Last error: %2$s', 'stormsale-woocommerce' ),
					$attempts,
					$result['error']
				)
			);

			StormSale_Plugin::log( 'Conversion permanently failed for order ' . $order_id . ': ' . $result['error'], 'error' );

			return;
		}

		$order->update_meta_data( self::META_STATUS, self::STATUS_RETRYING );
		$order->save();

		$delay = self::retry_delay( $attempts );
		$this->schedule_retry( $order_id, $delay );

		$order->add_order_note(
			sprintf(
				/* translators: 1: error message, 2: delay in seconds. */
				__( 'StormSale: conversion failed (%1$s). Retrying in %2$d seconds.', 'stormsale-woocommerce' ),
				$result['error'],
				$delay
			)
		);
	}

	/**
	 * Mark an order as verified on the Stellar ledger.
	 *
	 * @param mixed $order  WooCommerce order.
	 * @param array $result Gateway result.
	 * @return void
	 */
	private function mark_verified( $order, array $result ) {
		$order->update_meta_data( self::META_STATUS, self::STATUS_VERIFIED );
		$order->update_meta_data( self::META_TX_HASH, $result['tx_hash'] );
		$order->update_meta_data( self::META_VERIFIED_AT, gmdate( 'c' ) );
		$order->update_meta_data( self::META_LAST_ERROR, '' );
		$order->save();

		$this->persist_success_meta( $result );

		$order->add_order_note(
			sprintf(
				/* translators: %s: Stellar transaction hash. */
				__( 'StormSale: conversion verified on the Stellar ledger. Transaction: %s', 'stormsale-woocommerce' ),
				$result['tx_hash']
			)
		);

		StormSale_Plugin::log( 'Conversion verified for order ' . $order->get_id() . ' (' . $result['tx_hash'] . ').' );
	}

	/**
	 * Persist the last successful conversion details for the settings screen.
	 *
	 * @param array $result Gateway result.
	 * @return void
	 */
	private function persist_success_meta( array $result ) {
		if ( '' !== $result['tx_hash'] ) {
			update_option( StormSale_Settings::OPTION_LAST_TX_HASH, $result['tx_hash'] );
		}

		update_option( StormSale_Settings::OPTION_LAST_SUCCESS_AT, gmdate( 'c' ) );
		update_option( StormSale_Settings::OPTION_LAST_ERROR, '' );
	}

	/**
	 * Schedule a retry using Action Scheduler when available.
	 *
	 * @param int $order_id Order id.
	 * @param int $delay    Delay in seconds.
	 * @return void
	 */
	private function schedule_retry( $order_id, $delay ) {
		$timestamp = time() + $delay;

		if ( function_exists( 'as_schedule_single_action' ) ) {
			$args = array( (int) $order_id );

			if ( function_exists( 'as_has_scheduled_action' ) && as_has_scheduled_action( self::RETRY_HOOK, $args, 'stormsale' ) ) {
				return;
			}

			as_schedule_single_action( $timestamp, self::RETRY_HOOK, $args, 'stormsale' );
			return;
		}

		wp_schedule_single_event( $timestamp, self::RETRY_HOOK, array( (int) $order_id ) );
	}

	/**
	 * Exponential backoff delay for a given attempt number.
	 *
	 * @param int $attempt Attempt number (1 based).
	 * @return int Seconds.
	 */
	public static function retry_delay( $attempt ) {
		$attempt = max( 1, (int) $attempt );
		$delay   = self::BASE_RETRY_SECONDS * (int) pow( 2, $attempt - 1 );

		return (int) min( $delay, self::MAX_RETRY_SECONDS );
	}

	/**
	 * Add the manual resend action to the order actions dropdown.
	 *
	 * @param array<string,string> $actions Existing actions.
	 * @return array<string,string>
	 */
	public function register_order_action( $actions ) {
		$actions['stormsale_resend_conversion'] = __( 'Resend to StormSale', 'stormsale-woocommerce' );

		return $actions;
	}

	/**
	 * Handle the manual resend order action.
	 *
	 * @param mixed $order WooCommerce order.
	 * @return void
	 */
	public function on_manual_resend( $order ) {
		if ( ! is_object( $order ) || ! method_exists( $order, 'get_id' ) ) {
			return;
		}

		$order->update_meta_data( self::META_STATUS, '' );
		$order->update_meta_data( self::META_ATTEMPTS, 0 );
		$order->save();

		$this->dispatch_conversion( $order->get_id() );
	}

	/**
	 * Normalize a WooCommerce order into a plain array (testable input shape).
	 *
	 * @param mixed $order WooCommerce order.
	 * @return array<string,mixed>
	 */
	public static function collect_order_data( $order ) {
		$items = array();

		if ( method_exists( $order, 'get_items' ) ) {
			foreach ( $order->get_items() as $item_id => $item ) {
				$quantity = method_exists( $item, 'get_quantity' ) ? (int) $item->get_quantity() : 1;
				$line     = method_exists( $order, 'get_item_total' )
					? (string) $order->get_item_total( $item, false, false )
					: '';

				$items[] = array(
					'item_id'      => (int) $item_id,
					'product_id'   => method_exists( $item, 'get_product_id' ) ? (int) $item->get_product_id() : 0,
					'variation_id' => method_exists( $item, 'get_variation_id' ) ? (int) $item->get_variation_id() : 0,
					'name'         => method_exists( $item, 'get_name' ) ? (string) $item->get_name() : '',
					'sku'          => method_exists( $item, 'get_sku' ) ? (string) $item->get_sku() : '',
					'quantity'     => $quantity,
					'line_total'   => $line,
				);
			}
		}

		return array(
			'id'              => method_exists( $order, 'get_id' ) ? (int) $order->get_id() : 0,
			'number'          => method_exists( $order, 'get_order_number' ) ? (string) $order->get_order_number() : '',
			'order_key'       => method_exists( $order, 'get_order_key' ) ? (string) $order->get_order_key() : '',
			'status'          => method_exists( $order, 'get_status' ) ? (string) $order->get_status() : '',
			'currency'        => method_exists( $order, 'get_currency' ) ? (string) $order->get_currency() : '',
			'total'           => method_exists( $order, 'get_total' ) ? (string) $order->get_total() : '',
			'subtotal'        => method_exists( $order, 'get_subtotal' ) ? (string) $order->get_subtotal() : '',
			'total_tax'       => method_exists( $order, 'get_total_tax' ) ? (string) $order->get_total_tax() : '',
			'shipping_total'  => method_exists( $order, 'get_shipping_total' ) ? (string) $order->get_shipping_total() : '',
			'payment_method'  => method_exists( $order, 'get_payment_method' ) ? (string) $order->get_payment_method() : '',
			'created_at'      => method_exists( $order, 'get_date_created' ) && $order->get_date_created()
				? $order->get_date_created()->date( 'c' )
				: gmdate( 'c' ),
			'customer_email'  => method_exists( $order, 'get_billing_email' ) ? (string) $order->get_billing_email() : '',
			'customer_name'   => self::collect_customer_name( $order ),
			'billing_country' => method_exists( $order, 'get_billing_country' ) ? (string) $order->get_billing_country() : '',
			'items'           => $items,
		);
	}

	/**
	 * Build the plaintext order payload transmitted to the gateway.
	 *
	 * @param array $order   Normalized order data.
	 * @param array $context Referral / campaign context.
	 * @return array<string,mixed>
	 */
	public static function build_payload( array $order, array $context ) {
		$order = array_merge(
			array(
				'id'              => 0,
				'number'          => '',
				'order_key'       => '',
				'status'          => '',
				'currency'        => '',
				'total'           => '',
				'subtotal'        => '',
				'total_tax'       => '',
				'shipping_total'  => '',
				'payment_method'  => '',
				'created_at'      => '',
				'customer_email'  => '',
				'customer_name'   => '',
				'billing_country' => '',
				'items'           => array(),
			),
			$order
		);

		$context = array_merge(
			array(
				'event_id'      => '',
				'campaign_id'   => '',
				'affiliate_id'  => '',
				'click_id'      => '',
				'store_url'     => '',
				'store_name'    => '',
				'occurred_at'   => gmdate( 'c' ),
			),
			$context
		);

		return array(
			'event_id'    => (string) $context['event_id'],
			'event'       => 'order.completed',
			'plugin'      => array(
				'name'    => 'stormsale-woocommerce',
				'version' => STORMSALE_WC_VERSION,
			),
			'campaign'    => array(
				'id' => (string) $context['campaign_id'],
			),
			'affiliate'   => array(
				'id'       => (string) $context['affiliate_id'],
				'click_id' => (string) $context['click_id'],
			),
			'order'       => array(
				'id'             => (int) $order['id'],
				'number'         => (string) $order['number'],
				'key_hash'       => self::hash_value( (string) $order['order_key'] ),
				'status'         => (string) $order['status'],
				'currency'       => (string) $order['currency'],
				'total'          => (string) $order['total'],
				'subtotal'       => (string) $order['subtotal'],
				'total_tax'      => (string) $order['total_tax'],
				'shipping_total' => (string) $order['shipping_total'],
				'payment_method' => (string) $order['payment_method'],
				'created_at'     => (string) $order['created_at'],
				'items'          => is_array( $order['items'] ) ? array_values( $order['items'] ) : array(),
			),
			'customer'    => array(
				'email'   => (string) $order['customer_email'],
				'name'    => (string) $order['customer_name'],
				'country' => (string) $order['billing_country'],
			),
			'store'       => array(
				'url'  => (string) $context['store_url'],
				'name' => (string) $context['store_name'],
			),
			'occurred_at' => (string) $context['occurred_at'],
		);
	}

	/**
	 * Build the referral/campaign context for an order.
	 *
	 * @param mixed $order    WooCommerce order.
	 * @param array $settings Plugin settings.
	 * @return array<string,mixed>
	 */
	private static function build_context( $order, array $settings ) {
		$affiliate = '';
		$click_id  = '';
		$campaign  = isset( $settings['campaign_id'] ) ? (string) $settings['campaign_id'] : '';
		$event_id  = '';
		$occurred  = gmdate( 'c' );

		if ( method_exists( $order, 'get_meta' ) ) {
			$affiliate = (string) $order->get_meta( StormSale_Referral::META_AFFILIATE );
			$click_id  = (string) $order->get_meta( StormSale_Referral::META_CLICK_ID );
			$event_id  = (string) $order->get_meta( self::META_EVENT_ID );

			$order_campaign = (string) $order->get_meta( StormSale_Referral::META_CAMPAIGN );

			if ( '' !== $order_campaign ) {
				$campaign = $order_campaign;
			}
		}

		if ( '' === $event_id ) {
			$event_id = StormSale_Crypto::uuid_v4();
		}

		if ( method_exists( $order, 'get_date_paid' ) && $order->get_date_paid() ) {
			$occurred = $order->get_date_paid()->date( 'c' );
		}

		return array(
			'event_id'     => $event_id,
			'campaign_id'  => $campaign,
			'affiliate_id' => $affiliate,
			'click_id'     => $click_id,
			'store_url'    => get_site_url(),
			'store_name'   => get_bloginfo( 'name' ),
			'occurred_at'  => $occurred,
		);
	}

	/**
	 * Stable idempotency key for an order conversion.
	 *
	 * @param int    $order_id  Order id.
	 * @param string $order_key Order key.
	 * @return string
	 */
	public static function idempotency_key( $order_id, $order_key ) {
		return 'wc_' . (int) $order_id . '_' . substr( self::hash_value( (string) $order_key ), 0, 32 );
	}

	/**
	 * Non-reversible hash helper.
	 *
	 * @param string $value Raw value.
	 * @return string
	 */
	public static function hash_value( $value ) {
		$value = (string) $value;

		if ( '' === $value ) {
			return '';
		}

		return hash( 'sha256', 'stormsale|' . $value );
	}

	/**
	 * Compose a customer display name.
	 *
	 * @param mixed $order WooCommerce order.
	 * @return string
	 */
	private static function collect_customer_name( $order ) {
		$first = method_exists( $order, 'get_billing_first_name' ) ? (string) $order->get_billing_first_name() : '';
		$last  = method_exists( $order, 'get_billing_last_name' ) ? (string) $order->get_billing_last_name() : '';

		return trim( $first . ' ' . $last );
	}
}
