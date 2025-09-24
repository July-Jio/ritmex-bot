/**
 * 精确的手续费计算工具
 * 根据AsterDex的实际手续费结构进行计算
 */

export interface OrderFeeInfo {
  orderType: "LIMIT" | "MARKET" | "STOP_MARKET" | "TRAILING_STOP_MARKET";
  isMaker: boolean;
  notional: number;
  feeRate: number;
  feeAmount: number;
}

/**
 * AsterDex手续费率配置
 */
export const ASTER_FEE_RATES = {
  LIMIT_MAKER: 0.0001,    // 0.01% - 限价单做市
  MARKET_TAKER: 0.00035,    // 0.035% - 市价单吃单
  STOP_MARKET: 0.00035,     // 0.035% - 止损单（市价执行）
  TRAILING_STOP: 0.00035,   // 0.035% - 跟踪止损（市价执行）
} as const;

/**
 * 根据订单类型和是否为做市商确定手续费率
 */
export function getFeeRate(orderType: string, isMaker: boolean): number {
  switch (orderType) {
    case "LIMIT":
      return isMaker ? ASTER_FEE_RATES.LIMIT_MAKER : ASTER_FEE_RATES.MARKET_TAKER;
    case "MARKET":
      return ASTER_FEE_RATES.MARKET_TAKER;
    case "STOP_MARKET":
      return ASTER_FEE_RATES.STOP_MARKET;
    case "TRAILING_STOP_MARKET":
      return ASTER_FEE_RATES.TRAILING_STOP;
    default:
      // 默认按市价单处理
      return ASTER_FEE_RATES.MARKET_TAKER;
  }
}

/**
 * 计算订单手续费
 */
export function calculateOrderFee(
  orderType: string,
  isMaker: boolean,
  notional: number
): OrderFeeInfo {
  const feeRate = getFeeRate(orderType, isMaker);
  const feeAmount = notional * feeRate;
  
  return {
    orderType: orderType as any,
    isMaker,
    notional,
    feeRate,
    feeAmount,
  };
}

/**
 * 批量计算订单手续费
 */
export function calculateBatchFees(
  orders: Array<{
    orderType: string;
    isMaker: boolean;
    notional: number;
  }>
): { totalFees: number; feeBreakdown: OrderFeeInfo[] } {
  let totalFees = 0;
  const feeBreakdown: OrderFeeInfo[] = [];
  
  for (const order of orders) {
    const feeInfo = calculateOrderFee(order.orderType, order.isMaker, order.notional);
    totalFees += feeInfo.feeAmount;
    feeBreakdown.push(feeInfo);
  }
  
  return { totalFees, feeBreakdown };
}

/**
 * 计算交易对的手续费统计
 */
export function calculateFeeStats(
  orders: Array<{
    orderType: string;
    isMaker: boolean;
    notional: number;
  }>
): {
  totalFees: number;
  makerFees: number;
  takerFees: number;
  limitOrderFees: number;
  marketOrderFees: number;
  avgFeeRate: number;
  feeBreakdown: Record<string, number>;
} {
  const stats = {
    totalFees: 0,
    makerFees: 0,
    takerFees: 0,
    limitOrderFees: 0,
    marketOrderFees: 0,
    avgFeeRate: 0,
    feeBreakdown: {} as Record<string, number>,
  };
  
  let totalNotional = 0;
  
  for (const order of orders) {
    const feeInfo = calculateOrderFee(order.orderType, order.isMaker, order.notional);
    
    stats.totalFees += feeInfo.feeAmount;
    totalNotional += order.notional;
    
    if (feeInfo.isMaker) {
      stats.makerFees += feeInfo.feeAmount;
    } else {
      stats.takerFees += feeInfo.feeAmount;
    }
    
    if (order.orderType === "LIMIT") {
      stats.limitOrderFees += feeInfo.feeAmount;
    } else {
      stats.marketOrderFees += feeInfo.feeAmount;
    }
    
    // 按订单类型统计
    const key = `${order.orderType}_${feeInfo.isMaker ? 'MAKER' : 'TAKER'}`;
    stats.feeBreakdown[key] = (stats.feeBreakdown[key] || 0) + feeInfo.feeAmount;
  }
  
  stats.avgFeeRate = totalNotional > 0 ? (stats.totalFees / totalNotional) * 100 : 0;
  
  return stats;
}

/**
 * 获取手续费优化建议
 */
export function getFeeOptimizationAdvice(feeStats: ReturnType<typeof calculateFeeStats>): string[] {
  const advice: string[] = [];
  
  if (feeStats.takerFees > feeStats.makerFees * 2) {
    advice.push("吃单手续费过高，建议增加限价单比例");
  }
  
  if (feeStats.marketOrderFees > feeStats.limitOrderFees * 3) {
    advice.push("市价单手续费过高，建议减少市价单使用");
  }
  
  if (feeStats.avgFeeRate > 0.02) {
    advice.push("平均手续费率过高，建议优化订单类型组合");
  }
  
  if (advice.length === 0) {
    advice.push("手续费结构合理，可以继续当前策略");
  }
  
  return advice;
}
