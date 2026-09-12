import type { Batch, DuplicateGroup, Gem, GemFields, OrderGroup, Status } from "./types";

export const STATUSES: Record<Status, string> = {
  pending: "待分拣",
  reviewing: "待确认",
  ready: "可镶嵌",
  set: "已镶嵌",
  defect: "缺陷搁置",
};

export const STATUS_ORDER: Status[] = ["pending", "reviewing", "ready", "set", "defect"];

/**
 * 状态机:新宝石从「待分拣」出发,可流向 待确认 / 可镶嵌 / 已镶嵌 / 缺陷搁置;
 * 待确认 → 可镶嵌 / 缺陷搁置;可镶嵌 → 已镶嵌 / 缺陷搁置;
 * 已镶嵌、缺陷搁置为终态。其余跳转一律视为非法。
 */
export const TRANSITIONS: Record<Status, Status[]> = {
  pending: ["reviewing", "ready", "set", "defect"],
  reviewing: ["ready", "defect"],
  ready: ["set", "defect"],
  set: [],
  defect: [],
};

export const OPTIONS = {
  types: ["钻石", "红宝石", "蓝宝石", "祖母绿", "尖晶石", "碧玺", "坦桑石", "珍珠", "其他"],
  shapes: ["圆形", "椭圆形", "梨形", "马眼形", "心形", "公主方", "祖母绿形", "垫形", "雷迪恩形", "其他"],
  clarities: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "肉眼干净", "其他"],
  cuts: ["EX", "VG", "G", "F", "P"],
  positions: ["主石", "副石", "配石", "围镶", "戒臂", "吊坠", "耳饰", "手链", "未指定"],
  colors: ["D", "E", "F", "G", "H", "I", "J", "K", "白", "黄", "蓝", "红", "绿", "粉", "其他"],
};

export const SIZE_BUCKETS = ["< 3.0mm", "3.0–3.9mm", "4.0–4.9mm", "5.0–6.4mm", "≥ 6.5mm", "未标注"];

export function uid(prefix = "id_"): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function createBatch(name: string, note: string): Batch {
  return { id: uid("batch_"), name: name.trim(), note: note.trim(), createdAt: new Date().toISOString() };
}

export function createGem(fields: GemFields, batchId: string): Gem {
  return {
    id: uid("gem_"),
    batchId,
    code: fields.code.trim(),
    type: fields.type || "钻石",
    shape: fields.shape || "圆形",
    carat: fields.carat === "" ? "" : Number(fields.carat),
    size: fields.size.trim(),
    clarity: fields.clarity,
    color: fields.color.trim(),
    cut: fields.cut,
    position: fields.position || "未指定",
    orderNo: fields.orderNo.trim(),
    status: "pending",
    defectReason: "",
    defectImage: "",
    history: [],
    createdAt: new Date().toISOString(),
  };
}

export function emptyGemFields(): GemFields {
  return { code: "", type: "钻石", shape: "圆形", carat: "", size: "", clarity: "VS1", color: "", cut: "VG", position: "主石", orderNo: "" };
}

export function validateGemFields(fields: GemFields): string[] {
  const errors: string[] = [];
  if (!fields.code.trim()) errors.push("编号不能为空");
  if (fields.carat !== "") {
    const n = Number(fields.carat);
    if (!Number.isFinite(n) || n < 0) errors.push("克拉必须是不小于 0 的数字");
  }
  return errors;
}

export function canTransition(from: Status, to: Status): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export type TransitionResult = { ok: true; from: Status; to: Status } | { ok: false; error: string };

/** 原地修改传入的 gem(调用方负责先拷贝)。非法跳转与缺缺陷原因都会被拦截。 */
export function transitionGem(gem: Gem, to: Status, opts: { reason?: string; image?: string } = {}): TransitionResult {
  if (!STATUSES[to]) return { ok: false, error: `未知状态:${to}` };
  if (gem.status === to) return { ok: false, error: `「${gem.code}」已处于「${STATUSES[to]}」` };
  if (!canTransition(gem.status, to)) {
    return { ok: false, error: `非法跳转:不能从「${STATUSES[gem.status]}」变为「${STATUSES[to]}」` };
  }
  if (to === "defect" && !(opts.reason ?? "").trim()) {
    return { ok: false, error: "搁置缺陷必须先填写缺陷原因" };
  }
  const from = gem.status;
  gem.status = to;
  if (to === "defect") {
    gem.defectReason = (opts.reason ?? "").trim();
    gem.defectImage = (opts.image ?? "").trim();
  }
  gem.history.push({ from, to, at: new Date().toISOString(), note: (opts.reason ?? "").trim() });
  return { ok: true, from, to };
}

/* ---------------- CSV 批量导入 ---------------- */

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
}

const IMPORT_COLUMNS: { key: keyof GemFields; aliases: string[] }[] = [
  { key: "code", aliases: ["编号", "code", "id"] },
  { key: "type", aliases: ["种类", "type"] },
  { key: "shape", aliases: ["形状", "shape"] },
  { key: "carat", aliases: ["克拉", "克拉重量", "carat", "ct"] },
  { key: "size", aliases: ["尺寸", "size"] },
  { key: "clarity", aliases: ["净度", "clarity"] },
  { key: "color", aliases: ["颜色", "color"] },
  { key: "cut", aliases: ["切工", "cut"] },
  { key: "position", aliases: ["镶嵌位置", "位置", "position"] },
  { key: "orderNo", aliases: ["订单号", "订单", "order", "orderno"] },
];

export interface ImportResult {
  gems: GemFields[];
  errors: string[];
  /** 文件内部重复编号 */
  duplicates: { code: string; count: number }[];
}

export function parseImport(text: string): ImportResult {
  const rows = parseCSV(text);
  if (!rows.length) return { gems: [], errors: ["没有可导入的数据行"], duplicates: [] };
  const first = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = first.some((h) => h === "编号" || h === "code");
  const colMap = hasHeader
    ? IMPORT_COLUMNS.map((col) => first.findIndex((h) => col.aliases.includes(h)))
    : IMPORT_COLUMNS.map((_, i) => i);
  if (colMap[0] === -1) return { gems: [], errors: ["缺少「编号」列"], duplicates: [] };
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const gems: GemFields[] = [];
  const errors: string[] = [];
  dataRows.forEach((r, idx) => {
    const fields = emptyGemFields();
    IMPORT_COLUMNS.forEach((col, ci) => {
      const v = colMap[ci] >= 0 ? (r[colMap[ci]] ?? "").trim() : "";
      if (v !== "") (fields[col.key] as string) = v;
    });
    const errs = validateGemFields(fields);
    if (errs.length) {
      errors.push(`第 ${idx + (hasHeader ? 2 : 1)} 行:${errs.join(";")}`);
      return;
    }
    gems.push(fields);
  });
  const counts = new Map<string, number>();
  gems.forEach((g) => counts.set(g.code, (counts.get(g.code) ?? 0) + 1));
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([code, count]) => ({ code, count }));
  return { gems, errors, duplicates };
}

/* ---------------- 查重 / 筛选 / 归集 / 导出 ---------------- */

export function findDuplicates(gems: Gem[]): DuplicateGroup[] {
  const byCode = new Map<string, Gem[]>();
  gems.forEach((g) => {
    const c = g.code.trim();
    if (!c) return;
    const list = byCode.get(c) ?? [];
    list.push(g);
    byCode.set(c, list);
  });
  return [...byCode.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([code, list]) => ({ code, gems: list }));
}

export function sizeBucket(size: string): string {
  const m = size.match(/(\d+(?:\.\d+)?)/);
  if (!m) return "未标注";
  const n = parseFloat(m[1]);
  if (n < 3) return "< 3.0mm";
  if (n < 4) return "3.0–3.9mm";
  if (n < 5) return "4.0–4.9mm";
  if (n < 6.5) return "5.0–6.4mm";
  return "≥ 6.5mm";
}

export function groupByOrder(gems: Gem[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  gems.forEach((g) => {
    const key = g.orderNo.trim() || "(未分配订单)";
    let o = map.get(key);
    if (!o) {
      o = { orderNo: key, gems: [], totalCarat: 0, statusCounts: {} };
      map.set(key, o);
    }
    o.gems.push(g);
    o.totalCarat += Number(g.carat) || 0;
    o.statusCounts[g.status] = (o.statusCounts[g.status] ?? 0) + 1;
  });
  return [...map.values()].sort((a, b) => a.orderNo.localeCompare(b.orderNo, "zh-CN"));
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function buildExportCSV(gems: Gem[], batchNameOf: (batchId: string) => string): string {
  const lines: string[] = [];
  const totalCarat = gems.reduce((s, g) => s + (Number(g.carat) || 0), 0);
  lines.push(["导出时间", new Date().toLocaleString("zh-CN")].map(csvEscape).join(","));
  lines.push(["总颗数", gems.length, "总克拉", totalCarat.toFixed(2)].map(csvEscape).join(","));
  const counts: Partial<Record<Status, number>> = {};
  gems.forEach((g) => (counts[g.status] = (counts[g.status] ?? 0) + 1));
  lines.push(
    ["状态统计", ...STATUS_ORDER.filter((s) => counts[s]).map((s) => `${STATUSES[s]} ${counts[s]}`)]
      .map(csvEscape)
      .join(",")
  );
  lines.push("");
  lines.push(["批次", "编号", "种类", "形状", "克拉", "尺寸", "净度", "颜色", "切工", "镶嵌位置", "订单号", "状态", "缺陷原因"].join(","));
  gems.forEach((g) =>
    lines.push(
      [batchNameOf(g.batchId), g.code, g.type, g.shape, g.carat, g.size, g.clarity, g.color, g.cut, g.position, g.orderNo, STATUSES[g.status], g.defectReason]
        .map(csvEscape)
        .join(",")
    )
  );
  return "\uFEFF" + lines.join("\r\n");
}
