/**
 * 策略优化工具
 * 用于分析和优化交易策略参数，减少亏损
 */

export interface StrategyAnalysis {
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
  profitableTrades: number;
  losingTrades: number;
}

export interface OptimizedConfig {
  // 做市策略优化参数
  maker: {
    bidOffset: number;      // 买价偏移（增加以降低成交概率）
    askOffset: number;      // 卖价偏移（增加以降低成交概率）
    tradeAmount: number;    // 交易数量（减少以降低风险）
    lossLimit: number;      // 止损限制（降低以快速止损）
    refreshInterval: number; // 刷新间隔（增加以降低频率）
  };
  
  // 趋势策略优化参数
  trend: {
    lossLimit: number;      // 止损限制
    trailingProfit: number; // 跟踪止盈
    profitLockTrigger: number; // 盈利锁定触发
    profitLockOffset: number;  // 盈利锁定偏移
    pollInterval: number;   // 轮询间隔
  };
  
  // 风险管理参数
  risk: {
    maxPositionSize: number;    // 最大持仓大小
    maxDailyLoss: number;      // 最大日亏损
    maxConsecutiveLosses: number; // 最大连续亏损次数
    cooldownPeriod: number;    // 冷却期（毫秒）
  };
}

/**
 * 获取优化的策略配置
 * 基于历史数据和市场条件动态调整参数
 */
export function getOptimizedConfig(
  marketVolatility: number = 0.02, // 市场波动率
  accountBalance: number = 1000,  // 账户余额
  currentDrawdown: number = 0     // 当前回撤
): OptimizedConfig {
  // 根据市场波动率调整参数
  const volatilityMultiplier = Math.max(0.5, Math.min(2.0, marketVolatility / 0.02));
  
  // 根据账户余额调整交易量
  const balanceMultiplier = Math.max(0.1, Math.min(1.0, accountBalance / 1000));
  
  // 根据当前回撤调整风险参数
  const riskMultiplier = currentDrawdown > 0.05 ? 0.5 : 1.0; // 回撤超过5%时降低风险

  return {
    maker: {
      // 增加偏移以减少成交概率，提高盈利概率
      bidOffset: 0.0001 * volatilityMultiplier,
      askOffset: 0.0001 * volatilityMultiplier,
      
      // 减少交易量以降低风险
      tradeAmount: Math.max(0.0005, 0.001 * balanceMultiplier * riskMultiplier),
      
      // 降低止损限制以快速止损
      lossLimit: Math.max(0.01, 0.03 * riskMultiplier),
      
      // 增加刷新间隔以降低频率
      refreshInterval: Math.max(2000, 1500 * volatilityMultiplier),
    },
    
    trend: {
      // 更严格的止损
      lossLimit: Math.max(0.015, 0.03 * riskMultiplier),
      
      // 更保守的止盈设置
      trailingProfit: Math.max(0.1, 0.2 * riskMultiplier),
      
      // 更早的盈利锁定
      profitLockTrigger: Math.max(0.05, 0.1 * riskMultiplier),
      profitLockOffset: Math.max(0.02, 0.05 * riskMultiplier),
      
      // 增加轮询间隔
      pollInterval: Math.max(1000, 500 * volatilityMultiplier),
    },
    
    risk: {
      // 限制最大持仓大小
      maxPositionSize: Math.min(0.01, 0.005 * balanceMultiplier),
      
      // 限制最大日亏损
      maxDailyLoss: Math.min(0.05, 0.1 * accountBalance * riskMultiplier),
      
      // 限制连续亏损次数
      maxConsecutiveLosses: Math.max(3, 5 * riskMultiplier),
      
      // 设置冷却期
      cooldownPeriod: Math.max(30000, 60000 * riskMultiplier), // 30秒到2分钟
    },
  };
}

/**
 * 分析策略表现
 */
export function analyzeStrategy(
  trades: Array<{
    pnl: number;
    timestamp: number;
    isMaker: boolean;
  }>
): StrategyAnalysis {
  if (trades.length === 0) {
    return {
      winRate: 0,
      avgProfit: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      totalTrades: 0,
      profitableTrades: 0,
      losingTrades: 0,
    };
  }

  const profitableTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  
  const totalProfit = profitableTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  
  const winRate = (profitableTrades.length / trades.length) * 100;
  const avgProfit = profitableTrades.length > 0 ? totalProfit / profitableTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
  
  // 计算最大回撤
  let maxDrawdown = 0;
  let peak = 0;
  let runningPnl = 0;
  
  for (const trade of trades) {
    runningPnl += trade.pnl;
    if (runningPnl > peak) {
      peak = runningPnl;
    }
    const drawdown = peak - runningPnl;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  // 计算夏普比率（简化版本）
  const avgReturn = trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length;
  const variance = trades.reduce((sum, t) => sum + Math.pow(t.pnl - avgReturn, 2), 0) / trades.length;
  const sharpeRatio = variance > 0 ? avgReturn / Math.sqrt(variance) : 0;

  return {
    winRate,
    avgProfit,
    avgLoss,
    profitFactor,
    maxDrawdown,
    sharpeRatio,
    totalTrades: trades.length,
    profitableTrades: profitableTrades.length,
    losingTrades: losingTrades.length,
  };
}

/**
 * 获取策略建议
 */
export function getStrategyRecommendations(analysis: StrategyAnalysis): string[] {
  const recommendations: string[] = [];
  
  if (analysis.winRate < 40) {
    recommendations.push("胜率过低，建议增加价格偏移以减少成交频率");
  }
  
  if (analysis.profitFactor < 1.0) {
    recommendations.push("盈利因子小于1，建议优化止损和止盈设置");
  }
  
  if (analysis.maxDrawdown > 0.1) {
    recommendations.push("最大回撤过大，建议降低单笔交易量和止损限制");
  }
  
  if (analysis.sharpeRatio < 0.5) {
    recommendations.push("夏普比率过低，建议优化风险收益比");
  }
  
  if (analysis.avgLoss > Math.abs(analysis.avgProfit) * 2) {
    recommendations.push("平均亏损过大，建议收紧止损设置");
  }
  
  if (recommendations.length === 0) {
    recommendations.push("策略表现良好，可以适当增加交易频率");
  }
  
  return recommendations;
}
