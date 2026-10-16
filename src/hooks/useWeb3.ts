import { useWeb3 as useWebContext } from "../context/WebContext";

export const useWeb3 = useWebContext;

export { useWeb3EventStream } from "./useWeb3EventStream";
export type { Web3ConnectionStatus, Web3EventStreamState } from "./useWeb3EventStream";
