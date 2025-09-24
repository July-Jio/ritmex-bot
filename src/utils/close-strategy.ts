/**
 * 平仓策略工具
 * 确保平仓价格能覆盖开仓和平仓手续费
 */

import { ASTER_FEE_RATES } from "./fee-calculator";

export interface CloseStrategyConfig {
  minProfitMargin: number;        // 最小盈利边际（覆盖手续费）
  timeoutMs: number;            // 超时时间（毫秒）
  fallbackToOriginal: boolean;  // 是否回退到原策略
}

export interface CloseOrderInfo {
  side: "BUY" | "SELL";
  price: number;
  amount: number;
  minProfitRequired: number;
  isTimeout: boolean;
  strategy: "profit_cover" | "original";
}

export class CloseStrategyManager {
  private config: CloseStrategyConfig;
  private orderStartTime: number = 0;
  private isActive = false;

  constructor(config: Partial<CloseStrategyConfig> = {}) {
    this.config = {
      minProfitMargin: 0.0001,  // 0.01% 最小盈利边际
      timeoutMs: 60000,         // 1分钟超时
      fallbackToOriginal: true, // 超时后回退到原策略
      ...config,
    };
  }

  /**
   * 开始平仓策略
   */
  startCloseStrategy(): void {
    this.isActive = true;
    this.orderStartTime = Date.now();
  }

  /**
   * 停止平仓策略
   */
  stopCloseStrategy(): void {
    this.isActive = false;
  }

  /**
   * 计算平仓价格，确保覆盖手续费
   */
  calculateClosePrice(
    entryPrice: number,
    amount: number,
    side: "BUY" | "SELL",
    currentBid: number,
    currentAsk: number
  ): CloseOrderInfo {
    const now = Date.now();
    const isTimeout = this.isActive && (now - this.orderStartTime) > this.config.timeoutMs;
    
    // 如果超时且允许回退，使用原策略
    if (isTimeout && this.config.fallbackToOriginal) {
      return {
        side,
        price: side === "SELL" ? currentBid : currentAsk,
        amount,
        minProfitRequired: 0,
        isTimeout: true,
        strategy: "original",
      };
    }

    // 计算所需的最小盈利
    const notional = entryPrice * amount;
    const openFee = notional * ASTER_FEE_RATES.LIMIT_MAKER; // 开仓手续费（限价单）
    const closeFee = notional * ASTER_FEE_RATES.MARKET_TAKER; // 平仓手续费（市价单）
    const totalFees = openFee + closeFee;
    const minProfitRequired = totalFees + (notional * this.config.minProfitMargin);

    // 计算平仓价格
    let closePrice: number;
    if (side === "SELL") {
      // 卖出平仓，需要更高的价格
      closePrice = entryPrice + (minProfitRequired / amount);
      // 确保不超过当前买价
      closePrice = Math.min(closePrice, currentBid);
    } else {
      // 买入平仓，需要更低的价格
      closePrice = entryPrice - (minProfitRequired / amount);
      // 确保不低于当前卖价
      closePrice = Math.max(closePrice, currentAsk);
    }

    return {
      side,
      price: closePrice,
      amount,
      minProfitRequired,
      isTimeout: false,
      strategy: "profit_cover",
    };
  }

  /**
   * 检查是否应该使用市价单平仓
   */
  shouldUseMarketClose(
    entryPrice: number,
    amount: number,
    side: "BUY" | "SELL",
    currentBid: number,
    currentAsk: number
  ): boolean {
    const closeInfo = this.calculateClosePrice(entryPrice, amount, side, currentBid, currentAsk);
    
    // 如果计算出的价格无法覆盖手续费，使用市价单
    if (closeInfo.strategy === "profit_cover") {
      const currentPrice = side === "SELL" ? currentBid : currentAsk;
      const potentialProfit = side === "SELL" 
        ? (currentPrice - entryPrice) * amount
        : (entryPrice - currentPrice) * amount;
      
      return potentialProfit < closeInfo.minProfitRequired;
    }
    
    return closeInfo.isTimeout;
  }

  /**
   * 获取策略状态
   */
  getStrategyStatus(): {
    isActive: boolean;
    elapsedTime: number;
    isTimeout: boolean;
    remainingTime: number;
  } {
    const now = Date.now();
    const elapsedTime = this.isActive ? now - this.orderStartTime : 0;
    const isTimeout = this.isActive && elapsedTime > this.config.timeoutMs;
    const remainingTime = Math.max(0, this.config.timeoutMs - elapsedTime);

    return {
      isActive: this.isActive,
      elapsedTime,
      isTimeout,
      remainingTime,
    };
  }

  /**
   * 获取策略建议
   */
  getStrategyAdvice(): string[] {
    const status = this.getStrategyStatus();
    const advice: string[] = [];

    if (status.isActive && !status.isTimeout) {
      const remainingSeconds = Math.ceil(status.remainingTime / 1000);
      advice.push(`平仓策略运行中，剩余时间: ${remainingSeconds}秒`);
    }

    if (status.isTimeout) {
      advice.push("平仓策略超时，已回退到原策略");
    }

    if (!status.isActive) {
      advice.push("平仓策略未激活");
    }

    return advice;
  }
}
