/**
 * 交易手续费计算工具
 * 基于AsterDex的手续费结构进行计算
 */

export interface FeeConfig {
  makerFeeRate: number;  // 限价单手续费率 (0.01%)
  takerFeeRate: number;  // 市价单手续费率 (0.035%)
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  makerFeeRate: 0.0001,  // 0.01% - 限价单手续费
  takerFeeRate: 0.00035,  // 0.035% - 市价单手续费
};

/**
 * 计算交易手续费
 * @param notional 交易名义价值 (价格 × 数量)
 * @param isMaker 是否为做市商订单
 * @param feeConfig 手续费配置
 * @returns 手续费金额
 */
export function calculateTradeFee(
  notional: number,
  isMaker: boolean,
  feeConfig: FeeConfig = DEFAULT_FEE_CONFIG
): number {
  const feeRate = isMaker ? feeConfig.makerFeeRate : feeConfig.takerFeeRate;
  return notional * feeRate;
}

/**
 * 计算订单的总手续费
 * @param orders 订单列表
 * @param feeConfig 手续费配置
 * @returns 总手续费
 */
export function calculateTotalFees(
  orders: Array<{
    side: "BUY" | "SELL";
    price: number;
    amount: number;
    isMaker?: boolean;
  }>,
  feeConfig: FeeConfig = DEFAULT_FEE_CONFIG
): number {
  let totalFees = 0;
  
  for (const order of orders) {
    const notional = order.price * order.amount;
    const isMaker = order.isMaker ?? false; // 默认假设为吃单
    const fee = calculateTradeFee(notional, isMaker, feeConfig);
    totalFees += fee;
  }
  
  return totalFees;
}

/**
 * 计算净盈亏（扣除手续费后）
 * @param grossPnl 毛盈亏
 * @param totalFees 总手续费
 * @returns 净盈亏
 */
export function calculateNetPnl(grossPnl: number, totalFees: number): number {
  return grossPnl - totalFees;
}

/**
 * 获取手续费配置
 * 可以从环境变量或配置文件读取
 */
export function getFeeConfig(): FeeConfig {
  return {
    makerFeeRate: parseFloat(process.env.MAKER_FEE_RATE || "0.0001"),  // 0.01% - 限价单
    takerFeeRate: parseFloat(process.env.TAKER_FEE_RATE || "0.00035"), // 0.035% - 市价单
  };
}
