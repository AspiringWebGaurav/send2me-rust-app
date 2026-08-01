import type { Transfer, TransferStatus } from "../models/transfer";

export const TERMINAL_STATUSES: readonly TransferStatus[] = [
  "completed",
  "failed",
  "cancelled",
] as const;

export function isTerminalStatus(status: TransferStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isTransferActive(t: Pick<Transfer, "status">): boolean {
  return !isTerminalStatus(t.status);
}

export function activeTransfers<T extends Pick<Transfer, "status">>(list: T[]): T[] {
  return list.filter(isTransferActive);
}
