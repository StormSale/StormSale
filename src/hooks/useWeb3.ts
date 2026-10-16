import { useWeb3 as useWeb3Context } from "../context/Web3Context";

export const useWeb3 = useWeb3Context;

export const useOptimisticWeb3 = () => {
  const context = useWeb3Context();

  const optimisticAction = async <T>(
    optimisticUpdate: () => void,
    revertUpdate: () => void,
    action: () => Promise<T>
  ): Promise<T> => {
    optimisticUpdate();
    try {
      const result = await action();
      return result;
    } catch (error) {
      revertUpdate();
      throw error;
    }
  };

  const runOptimistic = async <T>(
    optimisticUpdate: () => void,
    revertUpdate: () => void,
    action: () => Promise<T>
  ): Promise<T> => {
    return optimisticAction(optimisticUpdate, revertUpdate, action);
  };

  return { ...context, optimisticAction, runOptimistic };
};
