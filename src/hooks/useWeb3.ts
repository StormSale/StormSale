import { useWeb3 as useWeb3Context } from "../context/Web3Context";
import { useQuery } from "@tanstack/react-query";

export interface Web3State {
  account: string | null;
  chainId: number | null;
  balance: string | null;
  isConnected: boolean;
}

export const webb3QueryKeys = {
  all: ["web3"] as const,
  state: () => [...webb3QueryKeys.all, "state"] as const,
  balance: (address?: string | null) =>
    [...webb3QueryKeys.all, "balance", address ?? null] as const,
  chainId: () => [...webb3QueryKeys.all, "chainId"] as const,
};

export const useWebb3Query = () => {
  const context = useWeb3Context();

  const stateQuery = useQuery({
    queryKey: webb3QueryKeys.state(),
    queryFn: async (): Promise<Webb3State> => ({
      account: context.account ?? null,
      chainId: context.chainId ?? null,
      balance: context.balance ?? null,
      isConnected: Boolean(context.account),
    }),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const balanceQuery = useQuery({
    queryKey: webb3QueryKeys.balance(context.account),
    queryFn: async (): Promise<string | null> => context.balance ?? null,
    enabled: Boolean(context.account),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const chainIdQuery = useQuery({
    queryKey: webb3QueryKeys.chainId(),
    queryFn: async (): Promise<number | null> => context.chainId ?? null,
    staleTime: 60_000,
    refetchOnMount: true,
  });

  return {
    ...context,
    stateQuery,
    balanceQuery,
    chainIdQuery,
  };
};

export const useWeb3 = () => {
  const context = useWeb3Context();
  const { stateQuery, balanceQuery, chainIdQuery } = useWeb3Query();

  return {
    ...context,
    account: stateQuery.data?.account ?? context.account,
    chainId: chainIdQuery.data ?? context.chainId,
    balance: balanceQuery.data ?? context.balance,
    isConnected: stateQuery.data?.isConnected ?? Boolean(context.account),
    isLoading:
      stateQuery.isLoading ||
      balanceQuery.isLoading ||
      chainIdQuery.isLoading,
    refetch: async () => {
      await Promise.all([
        stateQuery.refetch(),
        balanceQuery.refetch(),
        chainIdQuery.refetch(),
      ]);
    },
  };
};
