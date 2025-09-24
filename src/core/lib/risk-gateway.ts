// 轻量风控网关骨架：不改变对外行为，仅提供可插拔的校验钩子
// 将来可在此处集中实现数量/价格/滑点/频率等限制

export interface PlaceOrderParams {
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  quantity?: number | string;
  price?: number | string;
  stopPrice?: number | string;
  reduceOnly?: boolean;
}

export interface RiskContext {
  lastPrice?: number | null;
  positionSize?: number;
}

export interface RiskDecision {
  allow: boolean;
  reason?: string;
}

export interface RiskGateConfig {
  // 预留扩展位，不改变现有行为
}

export class RiskGateway {
  constructor(private readonly config: RiskGateConfig = {}) {}

  // 当前默认放行，后续可逐步添加校验逻辑
  evaluatePlaceOrder(params: PlaceOrderParams, ctx: RiskContext = {}): RiskDecision {
    void params;
    void ctx;
    return { allow: true };
  }

  // 预留撤单、修改单等接口
  evaluateCancelOrder(): RiskDecision {
    return { allow: true };
  }
}





