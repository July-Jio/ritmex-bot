import type { PositionSnapshot } from "./strategy";
import { calculateTradeFee, type FeeConfig } from "./fees";

export function computePositionPnl(
  position: PositionSnapshot,
  bestBid?: number | null,
  bestAsk?: number | null,
  totalFees: number = 0
): number {
  const priceForPnl = position.positionAmt > 0 ? bestBid : bestAsk;
  if (!Number.isFinite(priceForPnl as number)) return 0;
  const absAmt = Math.abs(position.positionAmt);
  const grossPnl = position.positionAmt > 0
    ? ((priceForPnl as number) - position.entryPrice) * absAmt
    : (position.entryPrice - (priceForPnl as number)) * absAmt;
  
  // 扣除手续费
  return grossPnl - totalFees;
}

/**
 * 计算包含手续费的净盈亏
 * @param position 持仓快照
 * @param bestBid 最佳买价
 * @param bestAsk 最佳卖价
 * @param tradeFees 交易手续费总额
 * @param feeConfig 手续费配置
 * @returns 净盈亏
 */
export function computeNetPnl(
  position: PositionSnapshot,
  bestBid?: number | null,
  bestAsk?: number | null,
  tradeFees: number = 0,
  feeConfig?: FeeConfig
): number {
  return computePositionPnl(position, bestBid, bestAsk, tradeFees);
}

/**
 * 计算毛盈亏（不含手续费）
 */
export function computeGrossPnl(
  position: PositionSnapshot,
  bestBid?: number | null,
  bestAsk?: number | null
): number {
  const priceForPnl = position.positionAmt > 0 ? bestBid : bestAsk;
  if (!Number.isFinite(priceForPnl as number)) return 0;
  const absAmt = Math.abs(position.positionAmt);
  return position.positionAmt > 0
    ? ((priceForPnl as number) - position.entryPrice) * absAmt
    : (position.entryPrice - (priceForPnl as number)) * absAmt;
}


