export type ExplorerEntityType = 'tx' | 'account' | 'contract' | 'asset';
export type StellarNetwork = 'testnet' | 'public';

export function getStellarExpertUrl(
  type: ExplorerEntityType,
  id: string,
  network: StellarNetwork = 'testnet'
): string {
  const base = `https://stellar.expert/explorer/${network}`;
  switch (type) {
    case 'tx':
      return `${base}/tx/${id}`;
    case 'account':
      return `${base}/account/${id}`;
    case 'contract':
      return `${base}/contract/${id}`;
    case 'asset':
      return `${base}/asset/${id}`;
    default:
      return base;
  }
}
