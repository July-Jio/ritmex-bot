/**
 * 交易记录跟踪工具
 * 用于跟踪订单成交、手续费和盈亏计算
 */

import { calculateTradeFee, type FeeConfig } from "./fees";
import { calculateOrderFee, getFeeRate } from "./fee-calculator";

export interface TradeRecord {
  id: string;
  timestamp: number;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  amount: number;
  notional: number;
  isMaker: boolean;
  orderType: string;
  fee: number;
  feeRate: number;
  feeAsset: string;
  orderId: number;
  clientOrderId?: string;
}

export interface TradeStats {
  totalTrades: number;
  totalVolume: number;
  totalFees: number;
  makerFees: number;
  takerFees: number;
  limitOrderFees: number;
  marketOrderFees: number;
  grossPnl: number;
  netPnl: number;
  winRate: number;
  avgTradeSize: number;
  avgFeeRate: number;
  feeBreakdown: Record<string, number>;
}

export class TradeTracker {
  private trades: TradeRecord[] = [];
  private feeConfig: FeeConfig;

  constructor(feeConfig?: FeeConfig) {
    this.feeConfig = feeConfig || {
      makerFeeRate: 0.0002,
      takerFeeRate: 0.0004,
    };
  }

  /**
   * 添加交易记录
   */
  addTrade(trade: Omit<TradeRecord, "id" | "timestamp" | "notional" | "fee" | "feeRate">): void {
    const notional = trade.price * trade.amount;
    
    // 使用精确的手续费计算
    const feeInfo = calculateOrderFee(trade.orderType, trade.isMaker, notional);
    
    const record: TradeRecord = {
      ...trade,
      id: `${trade.orderId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      notional,
      fee: feeInfo.feeAmount,
      feeRate: feeInfo.feeRate,
      feeAsset: "USDT", // 默认手续费资产
    };

    this.trades.push(record);
  }

  /**
   * 从订单更新事件添加交易记录
   */
  addTradeFromOrderUpdate(
    orderUpdate: {
      orderId: number;
      symbol: string;
      side: "BUY" | "SELL";
      price: string;
      avgPrice: string;
      origQty: string;
      executedQty: string;
      cumQuote: string;
      commission: string;
      commissionAsset: string;
      isMaker?: boolean;
      type?: string; // 订单类型：LIMIT, MARKET, STOP_MARKET, etc.
    }
  ): void {
    const price = parseFloat(orderUpdate.avgPrice || orderUpdate.price);
    const amount = parseFloat(orderUpdate.executedQty);
    const notional = price * amount;
    const isMaker = orderUpdate.isMaker ?? (orderUpdate.type === "LIMIT");
    
    // 使用真实的手续费数据
    const commission = parseFloat(orderUpdate.commission || "0");
    let fee = commission;
    let feeRate = 0;
    
    if (commission > 0) {
      // 使用真实手续费数据
      feeRate = notional > 0 ? commission / notional : 0;
    } else {
      // 如果没有手续费数据，根据订单类型计算
      const feeInfo = calculateOrderFee(orderUpdate.type || "MARKET", isMaker, notional);
      fee = feeInfo.feeAmount;
      feeRate = feeInfo.feeRate;
    }

    const record: TradeRecord = {
      id: `${orderUpdate.orderId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      symbol: orderUpdate.symbol,
      side: orderUpdate.side,
      price,
      amount,
      notional,
      isMaker,
      orderType: orderUpdate.type || "MARKET",
      fee,
      feeRate,
      feeAsset: orderUpdate.commissionAsset || "USDT",
      orderId: orderUpdate.orderId,
    };
    
    this.trades.push(record);
  }

  /**
   * 获取所有交易记录
   */
  getAllTrades(): TradeRecord[] {
    return [...this.trades];
  }

  /**
   * 获取指定时间范围的交易记录
   */
  getTradesInRange(startTime: number, endTime: number): TradeRecord[] {
    return this.trades.filter(
      trade => trade.timestamp >= startTime && trade.timestamp <= endTime
    );
  }

  /**
   * 获取交易统计
   */
  getStats(): TradeStats {
    if (this.trades.length === 0) {
      return {
        totalTrades: 0,
        totalVolume: 0,
        totalFees: 0,
        makerFees: 0,
        takerFees: 0,
        limitOrderFees: 0,
        marketOrderFees: 0,
        grossPnl: 0,
        netPnl: 0,
        winRate: 0,
        avgTradeSize: 0,
        avgFeeRate: 0,
        feeBreakdown: {},
      };
    }

    const totalTrades = this.trades.length;
    const totalVolume = this.trades.reduce((sum, trade) => sum + trade.notional, 0);
    const totalFees = this.trades.reduce((sum, trade) => sum + trade.fee, 0);
    
    // 计算详细的手续费统计
    const makerFees = this.trades
      .filter(trade => trade.isMaker)
      .reduce((sum, trade) => sum + trade.fee, 0);
    
    const takerFees = this.trades
      .filter(trade => !trade.isMaker)
      .reduce((sum, trade) => sum + trade.fee, 0);
    
    const limitOrderFees = this.trades
      .filter(trade => trade.orderType === "LIMIT")
      .reduce((sum, trade) => sum + trade.fee, 0);
    
    const marketOrderFees = this.trades
      .filter(trade => trade.orderType === "MARKET")
      .reduce((sum, trade) => sum + trade.fee, 0);
    
    // 手续费分类统计
    const feeBreakdown: Record<string, number> = {};
    this.trades.forEach(trade => {
      const key = `${trade.orderType}_${trade.isMaker ? 'MAKER' : 'TAKER'}`;
      feeBreakdown[key] = (feeBreakdown[key] || 0) + trade.fee;
    });
    
    // 计算盈亏（这里需要根据实际持仓变化计算）
    const grossPnl = this.calculateGrossPnl();
    const netPnl = grossPnl - totalFees;
    
    // 计算胜率（简化版本，基于净盈亏）
    const profitableTrades = this.trades.filter(trade => {
      // 这里需要更复杂的逻辑来确定每笔交易是否盈利
      return true; // 临时返回true，实际需要根据持仓变化计算
    }).length;
    
    const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
    const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;
    const avgFeeRate = totalVolume > 0 ? (totalFees / totalVolume) * 100 : 0;

    return {
      totalTrades,
      totalVolume,
      totalFees,
      makerFees,
      takerFees,
      limitOrderFees,
      marketOrderFees,
      grossPnl,
      netPnl,
      winRate,
      avgTradeSize,
      avgFeeRate,
      feeBreakdown,
    };
  }

  /**
   * 计算毛盈亏
   * 这是一个简化版本，实际需要根据持仓变化计算
   */
  private calculateGrossPnl(): number {
    // 这里需要根据实际的持仓变化和价格变化计算
    // 暂时返回0，需要在策略引擎中实现
    return 0;
  }

  /**
   * 清空交易记录
   */
  clear(): void {
    this.trades = [];
  }

  /**
   * 获取最近的交易记录
   */
  getRecentTrades(count: number = 10): TradeRecord[] {
    return this.trades.slice(-count);
  }
}
