/**
 * Display formatters for the generic DataTable.
 *
 * Framework free helpers so the same truncation rules can be reused outside
 * React - CSV export, copy-to-clipboard text, log scrubbing - and so the
 * `AddressCell` / `TxHashCell` components and any other consumer can never
 * drift apart.
 */

/**
 * Truncates a Stellar address for display.
 *
 * Mirrors the `AddressCell` rule: values that are not longer than
 * `lead + tail + 3` characters are returned untouched.
 */
export function formatAddress(address: string, lead = 4, tail = 4): string {
  if (!address) return "";
  if (address.length <= lead + tail + 3) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

/**
 * Truncates a transaction hash for display.
 *
 * Mirrors the `TxHashCell` rule: values that are not longer than
 * `lead + tail` characters are returned untouched.
 */
export function formatHash(hash: string, lead = 6, tail = 4): string {
  if (!hash) return "";
  if (hash.length <= lead + tail) return hash;
  return `${hash.slice(0, lead)}...${hash.slice(-tail)}`;
}
