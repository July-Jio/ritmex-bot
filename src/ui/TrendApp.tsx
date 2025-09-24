import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { tradingConfig } from "../config";
import { AsterExchangeAdapter } from "../exchanges/aster-adapter";
import { TrendEngine, type TrendEngineSnapshot } from "../core/trend-engine";
import { formatNumber } from "../utils/format";
import { DataTable, type TableColumn } from "./components/DataTable";
import { getAccounts } from "../utils/accounts";

const READY_MESSAGE = "正在等待交易所推送数据…";

interface TrendAppProps {
  onExit: () => void;
}

const inputSupported = Boolean(process.stdin && (process.stdin as any).isTTY);

export function TrendApp({ onExit }: TrendAppProps) {
  const [snapshots, setSnapshots] = useState<Record<string, TrendEngineSnapshot>>({});
  const [error, setError] = useState<Error | null>(null);
  const enginesRef = useRef<Record<string, TrendEngine>>({});

  useInput(
    (input, key) => {
      if (key.escape) {
        Object.values(enginesRef.current).forEach((e) => e.stop());
        onExit();
      }
    },
    { isActive: inputSupported }
  );

  useEffect(() => {
    const accounts = getAccounts();
    if (!accounts.length) {
      setError(new Error("未发现账户，请设置 ASTER_ACCOUNTS 或 ASTER_API_KEY/SECRET"));
      return;
    }
    try {
      const newEngines: Record<string, TrendEngine> = {};
      const initial: Record<string, TrendEngineSnapshot> = {};
      accounts.forEach((acc, idx) => {
        const symbol = (acc.symbol ?? tradingConfig.symbol).toUpperCase();
        const adapter = new AsterExchangeAdapter({ apiKey: acc.apiKey, apiSecret: acc.apiSecret, symbol });
        const engine = new TrendEngine({ ...tradingConfig, symbol }, adapter);
        const key = `${idx + 1}:${symbol}`;
        newEngines[key] = engine;
        initial[key] = engine.getSnapshot();
        const handler = (next: TrendEngineSnapshot) => {
          setSnapshots((prev) => ({ ...prev, [key]: { ...next, tradeLog: [...next.tradeLog] } }));
        };
        engine.on("update", handler);
        engine.start();
      });
      enginesRef.current = newEngines;
      setSnapshots(initial);
      return () => {
        Object.entries(enginesRef.current).forEach(([key, engine]) => {
          // @ts-expect-error handler captured in closure per instance
          engine.off("update", undefined);
          engine.stop();
        });
      };
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">启动失败: {error.message}</Text>
        <Text color="gray">请检查环境变量和网络连通性。</Text>
      </Box>
    );
  }

  if (!Object.keys(snapshots).length) {
    return (
      <Box padding={1}>
        <Text>正在初始化趋势策略…</Text>
      </Box>
    );
  }

  const entries = Object.entries(snapshots);
  const totals = entries.reduce(
    (acc, [, snap]) => {
      acc.volume += snap.sessionVolume || 0;
      acc.totalProfit += Number.isFinite(snap.totalProfit) ? snap.totalProfit : 0;
      acc.unrealized += Number.isFinite(snap.unrealized) ? snap.unrealized : 0;
      acc.trades += Number.isFinite(snap.totalTrades) ? snap.totalTrades : 0;
      return acc;
    },
    { volume: 0, totalProfit: 0, unrealized: 0, trades: 0 }
  );
  const orderColumns: TableColumn[] = [
    { key: "id", header: "ID", align: "right", minWidth: 6 },
    { key: "side", header: "Side", minWidth: 4 },
    { key: "type", header: "Type", minWidth: 10 },
    { key: "price", header: "Price", align: "right", minWidth: 10 },
    { key: "qty", header: "Qty", align: "right", minWidth: 8 },
    { key: "filled", header: "Filled", align: "right", minWidth: 8 },
    { key: "status", header: "Status", minWidth: 10 },
  ];

  const renderPanel = (label: string, snapshot: TrendEngineSnapshot) => {
    const { position, tradeLog, openOrders, trend, ready, lastPrice, sma30, sessionVolume } = snapshot;
    const hasPosition = Math.abs(position.positionAmt) > 1e-5;
    const lastLogs = tradeLog.slice(-5);
    const sortedOrders = [...openOrders].sort((a, b) => (Number(b.updateTime ?? 0) - Number(a.updateTime ?? 0)) || Number(b.orderId) - Number(a.orderId));
    const orderRows = sortedOrders.slice(0, 8).map((order) => ({
      id: order.orderId,
      side: order.side,
      type: order.type,
      price: order.price,
      qty: order.origQty,
      filled: order.executedQty,
      status: order.status,
    }));
    const orderColumns: TableColumn[] = [
      { key: "id", header: "ID", align: "right", minWidth: 6 },
      { key: "side", header: "Side", minWidth: 4 },
      { key: "type", header: "Type", minWidth: 10 },
      { key: "price", header: "Price", align: "right", minWidth: 10 },
      { key: "qty", header: "Qty", align: "right", minWidth: 8 },
      { key: "filled", header: "Filled", align: "right", minWidth: 8 },
      { key: "status", header: "Status", minWidth: 10 },
    ];
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} key={label} borderStyle="round">
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyanBright">Trend Strategy Dashboard {label} ｜ {snapshot.symbol}</Text>
          <Text>
            最近价格: {formatNumber(lastPrice, 2)} ｜ SMA30: {formatNumber(sma30, 2)} ｜ 趋势: {trend}
          </Text>
          <Text color="gray">状态: {ready ? "实时运行" : READY_MESSAGE}</Text>
        </Box>
        <Box flexDirection="row" marginBottom={1}>
          <Box flexDirection="column" marginRight={4}>
            <Text color="greenBright">持仓</Text>
            {hasPosition ? (
              <>
                <Text>
                  方向: {position.positionAmt > 0 ? "多" : "空"} ｜ 数量: {formatNumber(Math.abs(position.positionAmt), 4)} ｜ 开仓价: {formatNumber(position.entryPrice, 2)}
                </Text>
                <Text>
                  浮动盈亏: {formatNumber(snapshot.pnl, 4)} USDT ｜ 账户未实现盈亏: {formatNumber(snapshot.unrealized, 4)} USDT
                </Text>
              </>
            ) : (
              <Text color="gray">当前无持仓</Text>
            )}
          </Box>
          <Box flexDirection="column">
            <Text color="greenBright">绩效</Text>
            <Text>
              累计交易次数: {snapshot.totalTrades} ｜ 累计收益: {formatNumber(snapshot.totalProfit, 4)} USDT
            </Text>
            <Text>
              累计成交量: {formatNumber(sessionVolume, 2)} USDT
            </Text>
            {snapshot.lastOpenSignal.side ? (
              <Text color="gray">
                最近开仓信号: {snapshot.lastOpenSignal.side} @ {formatNumber(snapshot.lastOpenSignal.price, 2)}
              </Text>
            ) : null}
          </Box>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow">当前挂单</Text>
          {orderRows.length > 0 ? (
            <DataTable columns={orderColumns} rows={orderRows} />
          ) : (
            <Text color="gray">暂无挂单</Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text color="yellow">最近交易与事件</Text>
          <Text>
            账户成交额: {formatNumber(snapshot.sessionVolume, 2)} USDT ｜ 累计总盈亏: {formatNumber(snapshot.totalProfit, 4)} USDT ｜ 未实现盈亏: {formatNumber(snapshot.unrealized, 4)} USDT ｜ 交易次数: {snapshot.totalTrades}
          </Text>
          {lastLogs.length > 0 ? (
            lastLogs.map((item, index) => (
              <Text key={`${item.time}-${index}`}>
                [{item.time}] [{item.type}] {item.detail}
              </Text>
            ))
          ) : (
            <Text color="gray">暂无日志</Text>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyanBright">Trend Strategy Dashboard（多账户）</Text>
        <Text color="gray">按 Esc 返回策略选择</Text>
        <Text>
          总成交额: {formatNumber(totals.volume, 2)} USDT ｜ 汇总总盈亏: {formatNumber(totals.totalProfit, 4)} USDT ｜ 汇总未实现盈亏: {formatNumber(totals.unrealized, 4)} USDT ｜ 总交易次数: {totals.trades}
        </Text>
      </Box>
      <Box flexDirection="column" gap={1}>
        {entries.map(([label, snap]) => renderPanel(label, snap))}
      </Box>
    </Box>
  );
}
