/**
 * 高级风险管理工具
 * 提供多层次的风险控制机制
 */

export interface RiskLimits {
  maxPositionSize: number;        // 最大持仓大小
  maxDailyLoss: number;          // 最大日亏损
  maxConsecutiveLosses: number;   // 最大连续亏损次数
  maxDrawdown: number;           // 最大回撤
  cooldownPeriod: number;        // 冷却期（毫秒）
  emergencyStopLoss: number;     // 紧急止损
}

export interface RiskState {
  currentDrawdown: number;       // 当前回撤
  consecutiveLosses: number;     // 连续亏损次数
  dailyLoss: number;            // 日亏损
  lastTradeTime: number;         // 上次交易时间
  isInCooldown: boolean;       // 是否在冷却期
  emergencyStopTriggered: boolean; // 紧急止损是否触发
}

export class RiskManager {
  private limits: RiskLimits;
  private state: RiskState;
  private tradeHistory: Array<{
    timestamp: number;
    pnl: number;
    isMaker: boolean;
  }> = [];

  constructor(limits: RiskLimits) {
    this.limits = limits;
    this.state = {
      currentDrawdown: 0,
      consecutiveLosses: 0,
      dailyLoss: 0,
      lastTradeTime: 0,
      isInCooldown: false,
      emergencyStopTriggered: false,
    };
  }

  /**
   * 检查是否可以开新仓
   */
  canOpenPosition(proposedSize: number): { allowed: boolean; reason?: string } {
    // 检查紧急止损
    if (this.state.emergencyStopTriggered) {
      return { allowed: false, reason: "紧急止损已触发" };
    }

    // 检查冷却期
    if (this.state.isInCooldown) {
      const timeSinceLastTrade = Date.now() - this.state.lastTradeTime;
      if (timeSinceLastTrade < this.limits.cooldownPeriod) {
        return { allowed: false, reason: "冷却期内，禁止开仓" };
      }
    }

    // 检查持仓大小
    if (proposedSize > this.limits.maxPositionSize) {
      return { allowed: false, reason: `持仓大小超过限制: ${proposedSize} > ${this.limits.maxPositionSize}` };
    }

    // 检查连续亏损
    if (this.state.consecutiveLosses >= this.limits.maxConsecutiveLosses) {
      return { allowed: false, reason: `连续亏损次数过多: ${this.state.consecutiveLosses} >= ${this.limits.maxConsecutiveLosses}` };
    }

    // 检查日亏损
    if (this.state.dailyLoss >= this.limits.maxDailyLoss) {
      return { allowed: false, reason: `日亏损超过限制: ${this.state.dailyLoss} >= ${this.limits.maxDailyLoss}` };
    }

    // 检查回撤
    if (this.state.currentDrawdown >= this.limits.maxDrawdown) {
      return { allowed: false, reason: `回撤超过限制: ${this.state.currentDrawdown} >= ${this.limits.maxDrawdown}` };
    }

    return { allowed: true };
  }

  /**
   * 记录交易结果
   */
  recordTrade(pnl: number, isMaker: boolean = false): void {
    const now = Date.now();
    this.tradeHistory.push({
      timestamp: now,
      pnl,
      isMaker,
    });

    // 更新状态
    this.state.lastTradeTime = now;
    
    if (pnl < 0) {
      this.state.consecutiveLosses++;
      this.state.dailyLoss += Math.abs(pnl);
    } else {
      this.state.consecutiveLosses = 0;
    }

    // 更新回撤
    this.updateDrawdown();

    // 检查紧急止损
    if (this.state.currentDrawdown >= this.limits.emergencyStopLoss) {
      this.state.emergencyStopTriggered = true;
    }

    // 检查是否需要进入冷却期
    if (this.state.consecutiveLosses >= this.limits.maxConsecutiveLosses) {
      this.state.isInCooldown = true;
    }
  }

  /**
   * 更新回撤
   */
  private updateDrawdown(): void {
    if (this.tradeHistory.length === 0) return;

    let peak = 0;
    let currentPnl = 0;
    let maxDrawdown = 0;

    for (const trade of this.tradeHistory) {
      currentPnl += trade.pnl;
      if (currentPnl > peak) {
        peak = currentPnl;
      }
      const drawdown = peak - currentPnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    this.state.currentDrawdown = maxDrawdown;
  }

  /**
   * 重置日统计（通常在每日开始时调用）
   */
  resetDailyStats(): void {
    this.state.dailyLoss = 0;
    this.state.consecutiveLosses = 0;
    this.state.isInCooldown = false;
  }

  /**
   * 重置紧急止损
   */
  resetEmergencyStop(): void {
    this.state.emergencyStopTriggered = false;
  }

  /**
   * 获取当前风险状态
   */
  getRiskState(): RiskState {
    return { ...this.state };
  }

  /**
   * 获取风险建议
   */
  getRiskAdvice(): string[] {
    const advice: string[] = [];

    if (this.state.currentDrawdown > this.limits.maxDrawdown * 0.8) {
      advice.push("回撤接近限制，建议降低交易频率");
    }

    if (this.state.consecutiveLosses > this.limits.maxConsecutiveLosses * 0.7) {
      advice.push("连续亏损接近限制，建议暂停交易");
    }

    if (this.state.dailyLoss > this.limits.maxDailyLoss * 0.8) {
      advice.push("日亏损接近限制，建议减少交易量");
    }

    if (this.state.isInCooldown) {
      const remainingTime = this.limits.cooldownPeriod - (Date.now() - this.state.lastTradeTime);
      if (remainingTime > 0) {
        advice.push(`冷却期剩余: ${Math.ceil(remainingTime / 1000)}秒`);
      }
    }

    if (this.state.emergencyStopTriggered) {
      advice.push("紧急止损已触发，需要手动重置");
    }

    return advice;
  }

  /**
   * 计算建议的交易量
   */
  getSuggestedTradeSize(baseSize: number): number {
    const riskMultiplier = this.calculateRiskMultiplier();
    return Math.max(0.0001, baseSize * riskMultiplier);
  }

  /**
   * 计算风险乘数
   */
  private calculateRiskMultiplier(): number {
    let multiplier = 1.0;

    // 根据回撤调整
    if (this.state.currentDrawdown > this.limits.maxDrawdown * 0.5) {
      multiplier *= 0.5;
    }

    // 根据连续亏损调整
    if (this.state.consecutiveLosses > this.limits.maxConsecutiveLosses * 0.5) {
      multiplier *= 0.3;
    }

    // 根据日亏损调整
    if (this.state.dailyLoss > this.limits.maxDailyLoss * 0.5) {
      multiplier *= 0.5;
    }

    return Math.max(0.1, multiplier);
  }
}
