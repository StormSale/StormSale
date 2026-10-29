<?php
/**
 * Uninstall routine: removes plugin options, transients and scheduled actions.
 *
 * Order meta is intentionally preserved so historical affiliate attribution and
 * ledger transaction hashes remain auditable after the plugin is removed.
 *
 * @package StormSale_WooCommerce
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$stormsale_options = array(
	'stormsale_campaign_id',
	'stormsale_api_key',
	'stormsale_gateway_url',
	'stormsale_enable_click_tracking',
	'stormsale_enable_conversion_logging',
	'stormsale_cookie_ttl_days',
	'stormsale_debug_logging',
	'stormsale_last_status',
	'stormsale_last_error',
	'stormsale_last_tx_hash',
	'stormsale_last_success_at',
	'stormsale_last_attempt_at',
);

foreach ( $stormsale_options as $stormsale_option ) {
	delete_option( $stormsale_option );
}

if ( function_exists( 'wp_clear_scheduled_hook' ) ) {
	wp_clear_scheduled_hook( 'stormsale_dispatch_click' );
	wp_clear_scheduled_hook( 'stormsale_dispatch_conversion' );
}

if ( function_exists( 'as_unschedule_all_actions' ) ) {
	as_unschedule_all_actions( 'stormsale_dispatch_click', array(), 'stormsale' );
	as_unschedule_all_actions( 'stormsale_dispatch_conversion', array(), 'stormsale' );
}

global $wpdb;

if ( isset( $wpdb ) ) {
	// Remove referral click de-duplication transients.
	$wpdb->query(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_stormsale_click_%' OR option_name LIKE '_transient_timeout_stormsale_click_%'"
	);
}

unset( $stormsale_options, $stormsale_option );
