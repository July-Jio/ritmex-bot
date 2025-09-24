/**
 * 刷交易量策略优化器
 * 专注于最大化交易量同时最小化本金损失
 */

export interface VolumeStrategyConfig {
  // 刷量核心参数
  maxVolumePerMinute: number;     // 每分钟最大交易量
  targetVolumePerHour: number;    // 每小时目标交易量
  minTradeInterval: number;       // 最小交易间隔（毫秒）
  
  // 风险控制参数
  maxPositionHoldTime: number;     // 最大持仓时间（毫秒）
  quickCloseThreshold: number;     // 快速平仓阈值
  maxDrawdownPerTrade: number;     // 单笔最大回撤
  
  // 价格策略参数
  aggressivePricing: boolean;      // 是否使用激进定价
  priceSpreadTolerance: number;    // 价格点差容忍度
  marketMakingDepth: number;      // 做市深度级别
  
  // 交易量统计
  volumeStats: {
    totalVolume: number;
    tradesPerMinute: number;
    avgTradeSize: number;
    volumeEfficiency: number;      // 交易量效率
  };
}

export interface VolumeMetrics {
  sessionVolume: number;           // 会话交易量
  tradesCount: number;            // 交易次数
  avgTradeSize: number;           // 平均交易大小
  volumePerMinute: number;        // 每分钟交易量
  volumePerHour: number;          // 每小时交易量
  successRate: number;            // 成功率（盈利交易占比）
  avgHoldTime: number;            // 平均持仓时间
  volumeEfficiency: number;       // 交易量效率
}

export class VolumeStrategyOptimizer {
  private config: VolumeStrategyConfig;
  private tradeHistory: Array<{
    timestamp: number;
    volume: number;
    pnl: number;
    holdTime: number;
    isMaker: boolean;
  }> = [];
  
  private lastTradeTime = 0;
  private sessionStartTime = Date.now();

  constructor(config: Partial<VolumeStrategyConfig> = {}) {
    this.config = {
      maxVolumePerMinute: 100,        // 每分钟最大100 USDT交易量
      targetVolumePerHour: 5000,      // 每小时目标5000 USDT交易量
      minTradeInterval: 1000,         // 最小1秒交易间隔
      maxPositionHoldTime: 30000,     // 最大30秒持仓时间
      quickCloseThreshold: 0.001,     // 0.1%快速平仓阈值
      maxDrawdownPerTrade: 0.002,     // 单笔最大0.2%回撤
      aggressivePricing: true,        // 使用激进定价
      priceSpreadTolerance: 0.0005,   // 0.05%点差容忍度
      marketMakingDepth: 1,          // 做市深度级别1
      volumeStats: {
        totalVolume: 0,
        tradesPerMinute: 0,
        avgTradeSize: 0,
        volumeEfficiency: 0,
      },
      ...config,
    };
  }

  /**
   * 检查是否可以执行新交易
   */
  canExecuteTrade(proposedVolume: number): { allowed: boolean; reason?: string; suggestedVolume?: number } {
    const now = Date.now();
    const timeSinceLastTrade = now - this.lastTradeTime;
    
    // 检查最小交易间隔
    if (timeSinceLastTrade < this.config.minTradeInterval) {
      return { 
        allowed: false, 
        reason: `交易间隔过短: ${timeSinceLastTrade}ms < ${this.config.minTradeInterval}ms` 
      };
    }

    // 检查每分钟交易量限制
    const recentVolume = this.getRecentVolume(60000); // 最近1分钟
    if (recentVolume + proposedVolume > this.config.maxVolumePerMinute) {
      const suggestedVolume = Math.max(0.001, this.config.maxVolumePerMinute - recentVolume);
      return { 
        allowed: false, 
        reason: `超过每分钟交易量限制: ${recentVolume + proposedVolume} > ${this.config.maxVolumePerMinute}`,
        suggestedVolume
      };
    }

    return { allowed: true };
  }

  /**
   * 记录交易
   */
  recordTrade(volume: number, pnl: number, holdTime: number, isMaker: boolean = true): void {
    const now = Date.now();
    this.tradeHistory.push({
      timestamp: now,
      volume,
      pnl,
      holdTime,
      isMaker,
    });
    
    this.lastTradeTime = now;
    this.updateVolumeStats();
  }

  /**
   * 获取建议的交易量
   */
  getSuggestedTradeSize(): number {
    const recentVolume = this.getRecentVolume(60000); // 最近1分钟
    const remainingVolume = this.config.maxVolumePerMinute - recentVolume;
    
    // 基于剩余交易量计算建议交易大小
    const timeRemaining = 60000 - (Date.now() - this.sessionStartTime) % 60000;
    const volumePerSecond = remainingVolume / (timeRemaining / 1000);
    
    return Math.max(0.001, Math.min(0.01, volumePerSecond * 2)); // 2秒的交易量
  }

  /**
   * 检查是否需要快速平仓
   */
  shouldQuickClose(currentPnl: number, holdTime: number): boolean {
    // 基于盈亏的快速平仓
    if (Math.abs(currentPnl) >= this.config.quickCloseThreshold) {
      return true;
    }
    
    // 基于持仓时间的快速平仓
    if (holdTime >= this.config.maxPositionHoldTime) {
      return true;
    }
    
    // 基于回撤的快速平仓
    if (currentPnl <= -this.config.maxDrawdownPerTrade) {
      return true;
    }
    
    return false;
  }

  /**
   * 获取交易量指标
   */
  getVolumeMetrics(): VolumeMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    
    // 最近1分钟的交易
    const tradesLastMinute = this.tradeHistory.filter(t => t.timestamp > oneMinuteAgo);
    const volumePerMinute = tradesLastMinute.reduce((sum, t) => sum + t.volume, 0);
    
    // 最近1小时的交易
    const tradesLastHour = this.tradeHistory.filter(t => t.timestamp > oneHourAgo);
    const volumePerHour = tradesLastHour.reduce((sum, t) => sum + t.volume, 0);
    
    // 总交易统计
    const totalTrades = this.tradeHistory.length;
    const successfulTrades = this.tradeHistory.filter(t => t.pnl > 0).length;
    const successRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;
    
    // 平均持仓时间
    const totalHoldTime = this.tradeHistory.reduce((sum, t) => sum + t.holdTime, 0);
    const averageHoldTime = totalTrades > 0 ? totalHoldTime / totalTrades : 0;
    
    // 当前持仓名义价值
    const currentPositionNotional = this.currentPositionNotional;
    
    // 最大回撤
    const maxDrawdownPerTrade = this.config.maxDrawdownPerTrade;

    return {
      volumePerMinute,
      volumePerHour,
      totalTrades,
      successfulTrades,
      successRate,
      averageHoldTime,
      lastTradeTime: this.lastTradeTimestamp,
      currentPositionNotional,
      maxDrawdownPerTrade,
    };
  }

  /**
   * 获取优化建议
   */
  getOptimizationAdvice(): string[] {
    const metrics = this.getVolumeMetrics();
    const advice: string[] = [];
    
    if (metrics.volumePerHour < this.config.targetVolumePerHour * 0.8) {
      advice.push("交易量偏低，建议降低价格偏移或增加交易频率");
    }
    
    if (metrics.successRate < 60) {
      advice.push("成功率偏低，建议调整止损和止盈设置");
    }
    
    if (metrics.avgHoldTime > this.config.maxPositionHoldTime * 0.8) {
      advice.push("持仓时间过长，建议降低快速平仓阈值");
    }
    
    if (metrics.volumeEfficiency < 0.1) {
      advice.push("交易量效率偏低，建议优化交易策略参数");
    }
    
    if (advice.length === 0) {
      advice.push("交易量策略运行良好，可以适当增加交易频率");
    }
    
    return advice;
  }

  /**
   * 获取最近指定时间内的交易量
   */
  private getRecentVolume(timeWindow: number): number {
    const now = Date.now();
    return this.tradeHistory
      .filter(t => now - t.timestamp <= timeWindow)
      .reduce((sum, t) => sum + t.volume, 0);
  }

  /**
   * 更新交易量统计
   */
  private updateVolumeStats(): void {
    const metrics = this.getVolumeMetrics();
    this.config.volumeStats = {
      totalVolume: metrics.sessionVolume,
      tradesPerMinute: metrics.volumePerMinute,
      avgTradeSize: metrics.avgTradeSize,
      volumeEfficiency: metrics.volumeEfficiency,
    };
  }

  /**
   * 重置会话统计
   */
  resetSession(): void {
    this.tradeHistory = [];
    this.sessionStartTime = Date.now();
    this.lastTradeTime = 0;
  }
}
