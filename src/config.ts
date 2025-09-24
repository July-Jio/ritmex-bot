export interface TradingConfig {
  symbol: string;
  tradeAmount: number;
  lossLimit: number;
  trailingProfit: number;
  trailingCallbackRate: number;
  profitLockTriggerUsd: number;
  profitLockOffsetUsd: number;
  pollIntervalMs: number;
  maxLogEntries: number;
  klineInterval: string;
  maxCloseSlippagePct: number;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function randomInRange(min: number, max: number, decimals = 6): number {
  const n = min + Math.random() * (max - min);
  return Number(n.toFixed(decimals));
}

// 当未显式设置 TRADE_AMOUNT 时，使用 [0.001, 0.0012] 的随机值
const DEFAULT_RANDOM_TRADE_AMOUNT = randomInRange(0.001, 0.0012, 6);

export const tradingConfig: TradingConfig = {
  symbol: process.env.TRADE_SYMBOL ?? "BTCUSDT",
  tradeAmount: parseNumber(process.env.TRADE_AMOUNT, DEFAULT_RANDOM_TRADE_AMOUNT),
  lossLimit: parseNumber(process.env.LOSS_LIMIT, 0.003), // 极低止损，快速平仓
  trailingProfit: parseNumber(process.env.TRAILING_PROFIT, 0.01), // 极低跟踪止盈，快速获利了结
  trailingCallbackRate: parseNumber(process.env.TRAILING_CALLBACK_RATE, 0.05), // 极低回调率，快速调整
  profitLockTriggerUsd: parseNumber(process.env.PROFIT_LOCK_TRIGGER_USD, 0.001), // 极低盈利锁定触发
  profitLockOffsetUsd: parseNumber(process.env.PROFIT_LOCK_OFFSET_USD, 0.0005), // 极低盈利锁定偏移
  pollIntervalMs: parseNumber(process.env.POLL_INTERVAL_MS, 200), // 大幅降低轮询间隔，提高响应速度
  maxLogEntries: parseNumber(process.env.MAX_LOG_ENTRIES, 200),
  klineInterval: process.env.KLINE_INTERVAL ?? "1m",
  maxCloseSlippagePct: parseNumber(process.env.MAX_CLOSE_SLIPPAGE_PCT, 0.1), // 提高滑点容忍度，确保快速成交
};

export interface MakerConfig {
  symbol: string;
  tradeAmount: number;
  lossLimit: number;
  priceChaseThreshold: number;
  bidOffset: number;
  askOffset: number;
  refreshIntervalMs: number;
  maxLogEntries: number;
  maxCloseSlippagePct: number;
}

export const makerConfig: MakerConfig = {
  symbol: process.env.TRADE_SYMBOL ?? "BTCUSDT",
  tradeAmount: parseNumber(process.env.TRADE_AMOUNT, DEFAULT_RANDOM_TRADE_AMOUNT),
  lossLimit: parseNumber(process.env.MAKER_LOSS_LIMIT, parseNumber(process.env.LOSS_LIMIT, 0.005)), // 极低止损，快速平仓
  priceChaseThreshold: parseNumber(process.env.MAKER_PRICE_CHASE, 0.1), // 降低价格追逐阈值，快速调整
  bidOffset: parseNumber(process.env.MAKER_BID_OFFSET, 0), // 移除买价偏移，增加成交概率
  askOffset: parseNumber(process.env.MAKER_ASK_OFFSET, 0), // 移除卖价偏移，增加成交概率
  refreshIntervalMs: parseNumber(process.env.MAKER_REFRESH_INTERVAL_MS, 500), // 大幅降低刷新间隔，提高交易频率
  maxLogEntries: parseNumber(process.env.MAKER_MAX_LOG_ENTRIES, 200),
  maxCloseSlippagePct: parseNumber(
    process.env.MAKER_MAX_CLOSE_SLIPPAGE_PCT ?? process.env.MAX_CLOSE_SLIPPAGE_PCT,
    0.1 // 提高滑点容忍度，确保快速成交
  ),
};
