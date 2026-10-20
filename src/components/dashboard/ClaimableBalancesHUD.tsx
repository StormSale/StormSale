import React from 'react';
import { calculateClawbackExpiration } from '../../lib/stellar/claimableBalance';

export interface ClaimableBalanceItem {
  id: string;
  amount: string;
  assetCode: string;
  createdAt: string;
  advertiser: string;
}

interface Props {
  balances: ClaimableBalanceItem[];
  onClaim: (balanceId: string) => void;
}

export const ClaimableBalancesHUD: React.FC<Props> = ({ balances, onClaim }) => {
  return (
    <div className="p-6 bg-slate-900 text-white rounded-xl shadow-lg">
      <h3 className="text-xl font-bold mb-4">Pending Commission Escrows (Claimable Balances)</h3>
      {balances.length === 0 ? (
        <p className="text-slate-400">No pending claimable balances found.</p>
      ) : (
        <div className="space-y-4">
          {balances.map((item) => {
            const { expirationDate, isExpired } = calculateClawbackExpiration(item.createdAt);
            return (
              <div key={item.id} className="p-4 bg-slate-800 rounded-lg flex justify-between items-center border border-slate-700">
                <div>
                  <p className="font-semibold text-lg">{item.amount} {item.assetCode}</p>
                  <p className="text-xs text-slate-400">Advertiser: {item.advertiser}</p>
                  <p className="text-xs text-amber-400 mt-1">
                    Clawback Expiration: {expirationDate.toLocaleDateString()} {isExpired ? '(Expired)' : ''}
                  </p>
                </div>
                <button
                  onClick={() => onClaim(item.id)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
                >
                  Claim
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
