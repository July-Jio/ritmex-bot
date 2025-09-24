import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { makerConfig } from "../config";
import { AsterExchangeAdapter } from "../exchanges/aster-adapter";
import { OffsetMakerEngine, type OffsetMakerEngineSnapshot } from "../core/offset-maker-engine";
import { DataTable, type TableColumn } from "./components/DataTable";
import { formatNumber } from "../utils/format";
import { getAccounts } from "../utils/accounts";

interface OffsetMakerAppProps {
  onExit: () => void;
}

const inputSupported = Boolean(process.stdin && (process.stdin as any).isTTY);

export function OffsetMakerApp({ onExit }: OffsetMakerAppProps) {
  const [snapshots, setSnapshots] = useState<Record<string, OffsetMakerEngineSnapshot>>({});
  const [error, setError] = useState<Error | null>(null);
  const enginesRef = useRef<Record<string, OffsetMakerEngine>>({});

  useInput(
    (input, key) => {
      if (key.escape) {
        Object.values(enginesRef.current).forEach(engine => engine.stop());
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
      const newEngines: Record<string, OffsetMakerEngine> = {};
      const initial: Record<string, OffsetMakerEngineSnapshot> = {};
      accounts.forEach((acc, idx) => {
        const symbol = (acc.symbol ?? makerConfig.symbol).toUpperCase();
        const adapter = new AsterExchangeAdapter({ apiKey: acc.apiKey, apiSecret: acc.apiSecret, symbol });
        const engine = new OffsetMakerEngine({ ...makerConfig, symbol }, adapter);
        const key = `${idx + 1}:${symbol}`;
        newEngines[key] = engine;
        initial[key] = engine.getSnapshot();
        const handler = (next: OffsetMakerEngineSnapshot) => {
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
        <Text>正在初始化偏移做市策略…</Text>
      </Box>
    );
  }

  const entries = Object.entries(snapshots);
  const totals = entries.reduce(
    (acc, [, snap]) => {
      acc.volume += snap.sessionVolume || 0;
      acc.unrealized += Number.isFinite(snap.accountUnrealized) ? snap.accountUnrealized : 0;
      acc.balance += Number.isFinite(snap.accountBalance) ? snap.accountBalance : 0;
      acc.pnl += Number.isFinite(snap.pnl) ? snap.pnl : 0;
      acc.grossPnl += Number.isFinite(snap.grossPnl) ? snap.grossPnl : 0;
      acc.netPnl += Number.isFinite(snap.netPnl) ? snap.netPnl : 0;
      acc.totalFees += Number.isFinite(snap.totalFees) ? snap.totalFees : 0;
      acc.limitOrderFees += Number.isFinite(snap.tradeStats?.limitOrderFees) ? snap.tradeStats.limitOrderFees : 0;
      acc.marketOrderFees += Number.isFinite(snap.tradeStats?.marketOrderFees) ? snap.tradeStats.marketOrderFees : 0;
      acc.totalTrades += snap.tradeStats?.totalTrades || 0;
      acc.volumePerMinute += snap.volumeMetrics?.volumePerMinute || 0;
      acc.volumePerHour += snap.volumeMetrics?.volumePerHour || 0;
      acc.successRate += snap.volumeMetrics?.successRate || 0;
      return acc;
    },
    { volume: 0, unrealized: 0, balance: 0, pnl: 0, grossPnl: 0, netPnl: 0, totalFees: 0, limitOrderFees: 0, marketOrderFees: 0, totalTrades: 0, volumePerMinute: 0, volumePerHour: 0, successRate: 0 }
  );

  const renderPanel = (label: string, snapshot: OffsetMakerEngineSnapshot) => {
    const topBid = snapshot.topBid;
    const topAsk = snapshot.topAsk;
    const spreadDisplay = snapshot.spread != null ? `${snapshot.spread.toFixed(4)} USDT` : "-";
    const hasPosition = Math.abs(snapshot.position.positionAmt) > 1e-5;
    const sortedOrders = [...snapshot.openOrders].sort((a, b) =>
      (Number(b.updateTime ?? 0) - Number(a.updateTime ?? 0)) || Number(b.orderId) - Number(a.orderId)
    );
    const openOrderRows = sortedOrders.slice(0, 8).map((order) => ({
      id: order.orderId,
      side: order.side,
      price: order.price,
      qty: order.origQty,
      filled: order.executedQty,
      reduceOnly: order.reduceOnly ? "yes" : "no",
      status: order.status,
  }));
  const openOrderColumns: TableColumn[] = [
    { key: "id", header: "ID", align: "right", minWidth: 6 },
    { key: "side", header: "Side", minWidth: 4 },
    { key: "price", header: "Price", align: "right", minWidth: 10 },
    { key: "qty", header: "Qty", align: "right", minWidth: 8 },
    { key: "filled", header: "Filled", align: "right", minWidth: 8 },
    { key: "reduceOnly", header: "RO", minWidth: 4 },
    { key: "status", header: "Status", minWidth: 10 },
  ];

  const desiredRows = snapshot.desiredOrders.map((order, index) => ({
    index: index + 1,
    side: order.side,
    price: order.price,
    amount: order.amount,
    reduceOnly: order.reduceOnly ? "yes" : "no",
  }));
  const desiredColumns: TableColumn[] = [
    { key: "index", header: "#", align: "right", minWidth: 2 },
    { key: "side", header: "Side", minWidth: 4 },
    { key: "price", header: "Price", align: "right", minWidth: 10 },
    { key: "amount", header: "Qty", align: "right", minWidth: 8 },
    { key: "reduceOnly", header: "RO", minWidth: 4 },
  ];

    const lastLogs = snapshot.tradeLog.slice(-5);
    const imbalanceLabel = snapshot.depthImbalance === "balanced"
      ? "均衡"
      : snapshot.depthImbalance === "buy_dominant"
      ? "买盘占优"
      : "卖盘占优";

    return (
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyanBright">Offset Maker Strategy - {label}</Text>
          <Text>
            交易对: {snapshot.symbol} ｜ 买一价: {formatNumber(topBid, 2)} ｜ 卖一价: {formatNumber(topAsk, 2)} ｜ 点差: {spreadDisplay}
          </Text>
          <Text>
            买10档累计: {formatNumber(snapshot.buyDepthSum10, 4)} ｜ 卖10档累计: {formatNumber(snapshot.sellDepthSum10, 4)} ｜ 状态: {imbalanceLabel}
          </Text>
          <Text color="gray">
            当前挂单策略: BUY {snapshot.skipBuySide ? "暂停" : "启用"} ｜ SELL {snapshot.skipSellSide ? "暂停" : "启用"}
          </Text>
          <Text color="gray">状态: {snapshot.ready ? "实时运行" : "等待市场数据"}</Text>
        </Box>

        <Box flexDirection="row" marginBottom={1}>
          <Box flexDirection="column" marginRight={4}>
            <Text color="greenBright">持仓</Text>
            {hasPosition ? (
              <>
                <Text>
                  方向: {snapshot.position.positionAmt > 0 ? "多" : "空"} ｜ 数量: {formatNumber(Math.abs(snapshot.position.positionAmt), 4)} ｜ 开仓价: {formatNumber(snapshot.position.entryPrice, 2)}
                </Text>
                <Text>
                  浮动盈亏: {formatNumber(snapshot.pnl, 4)} USDT ｜ 账户未实现盈亏: {formatNumber(snapshot.accountUnrealized, 4)} USDT
                </Text>
              </>
            ) : (
              <Text color="gray">当前无持仓</Text>
            )}
          </Box>
          <Box flexDirection="column">
            <Text color="greenBright">目标挂单</Text>
            {desiredRows.length > 0 ? (
              <DataTable columns={desiredColumns} rows={desiredRows} />
            ) : (
              <Text color="gray">暂无目标挂单</Text>
            )}
            <Text>
              累计成交量: {formatNumber(snapshot.sessionVolume, 2)} USDT
            </Text>
          </Box>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow">当前挂单</Text>
          {openOrderRows.length > 0 ? (
            <DataTable columns={openOrderColumns} rows={openOrderRows} />
          ) : (
            <Text color="gray">暂无挂单</Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text color="yellow">最近事件</Text>
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
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyanBright">Offset Maker Strategy Dashboard</Text>
        <Text>
          总交易量: {formatNumber(totals.volume, 2)} USDT ｜ 总交易次数: {totals.totalTrades} ｜ 总手续费: {formatNumber(totals.totalFees, 4)} USDT
        </Text>
        <Text>
          限价单手续费: {formatNumber(totals.limitOrderFees, 4)} USDT (0.01%) ｜ 市价单手续费: {formatNumber(totals.marketOrderFees, 4)} USDT (0.035%)
        </Text>
        <Text>
          交易量/分钟: {formatNumber(totals.volumePerMinute, 2)} USDT ｜ 交易量/小时: {formatNumber(totals.volumePerHour, 2)} USDT ｜ 平均成功率: {formatNumber(totals.successRate / entries.length, 1)}%
        </Text>
        <Text>
          汇总账户权益: {formatNumber(totals.balance, 2)} USDT ｜ 汇总未实现盈亏: {formatNumber(totals.unrealized, 4)} USDT ｜ 汇总净盈亏: {formatNumber(totals.netPnl, 4)} USDT
        </Text>
        <Text color="yellow">
          平仓策略: 覆盖手续费模式 (1分钟超时回退) ｜ 限价单手续费: 0.01% ｜ 市价单手续费: 0.035%
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        {entries.map(([label, snap]) => renderPanel(label, snap))}
      </Box>
    </Box>
  );
}

