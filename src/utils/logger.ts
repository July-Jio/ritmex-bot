// 轻量日志脱敏与统一输出工具
// - 默认截断长文本
// - 尝试去除看似敏感的键/值

const DEFAULT_MAX_LEN = 200;

function maskToken(token: string): string {
  if (token.length <= 8) return "******";
  return `${token.slice(0, 4)}******${token.slice(-4)}`;
}

function redactKeyValue(key: string, value: unknown): unknown {
  const lower = key.toLowerCase();
  const shouldMask =
    lower.includes("key") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.includes("password") ||
    lower.includes("signature") ||
    lower.includes("private") ||
    lower.includes("mnemonic");
  if (!shouldMask) return value;
  const str = String(value ?? "");
  return maskToken(str);
}

function truncate(text: string, maxLen = DEFAULT_MAX_LEN): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…(${text.length - maxLen} more)`;
}

export function redact(value: unknown, maxLen = DEFAULT_MAX_LEN): string {
  try {
    if (value == null) return "";
    if (typeof value === "string") return truncate(value, maxLen);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value instanceof Error) return truncate(value.message, maxLen);
    if (Array.isArray(value)) {
      const safe = value.slice(0, 20).map((v) => JSON.parse(redactObjectToJson(v)));
      const json = JSON.stringify(safe);
      return truncate(json, maxLen);
    }
    // object-like
    return truncate(redactObjectToJson(value), maxLen);
  } catch {
    return "[unserializable]";
  }
}

function redactObjectToJson(obj: unknown): string {
  try {
    if (!obj || typeof obj !== "object") return JSON.stringify(obj);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        out[k] = JSON.parse(redactObjectToJson(v));
      } else if (typeof v === "string") {
        out[k] = redactKeyValue(k, v);
      } else {
        out[k] = v;
      }
    }
    return JSON.stringify(out);
  } catch {
    return "{}";
  }
}

export const logger = {
  info(message: string, meta?: unknown): void {
    if (meta === undefined) {
      // eslint-disable-next-line no-console
      console.info(message);
    } else {
      // eslint-disable-next-line no-console
      console.info(message, redact(meta));
    }
  },
  warn(message: string, meta?: unknown): void {
    if (meta === undefined) {
      // eslint-disable-next-line no-console
      console.warn(message);
    } else {
      // eslint-disable-next-line no-console
      console.warn(message, redact(meta));
    }
  },
  error(message: string, meta?: unknown): void {
    if (meta === undefined) {
      // eslint-disable-next-line no-console
      console.error(message);
    } else {
      // eslint-disable-next-line no-console
      console.error(message, redact(meta));
    }
  },
};





