export interface AccountConfig {
  apiKey: string;
  apiSecret: string;
  symbol?: string;
}

function parseJsonEnv(name: string): AccountConfig[] | null {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => ({ apiKey: String(x.apiKey ?? x.key ?? ""), apiSecret: String(x.apiSecret ?? x.secret ?? ""), symbol: x.symbol ? String(x.symbol) : undefined }))
        .filter((x) => x.apiKey && x.apiSecret);
    }
    return null;
  } catch {
    return null;
  }
}

function parseIndexedEnv(prefixKey: string, prefixSecret: string): AccountConfig[] {
  const result: AccountConfig[] = [];
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`${prefixKey}_${i}`];
    const secret = process.env[`${prefixSecret}_${i}`];
    if (key && secret) {
      const symbol = process.env[`TRADE_SYMBOL_${i}`] ?? process.env.TRADE_SYMBOL;
      result.push({ apiKey: key, apiSecret: secret, symbol });
    }
  }
  return result;
}

export function getAccounts(): AccountConfig[] {
  const fromJson = parseJsonEnv("ASTER_ACCOUNTS");
  if (fromJson && fromJson.length) return fromJson;
  const indexed = parseIndexedEnv("ASTER_API_KEY", "ASTER_API_SECRET");
  if (indexed.length) return indexed;
  const singleKey = process.env.ASTER_API_KEY;
  const singleSecret = process.env.ASTER_API_SECRET;
  if (singleKey && singleSecret) return [{ apiKey: singleKey, apiSecret: singleSecret, symbol: process.env.TRADE_SYMBOL }];
  return [];
}




