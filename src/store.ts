import type { Batch, Gem } from "./types";

export interface Filters {
  shape: string;
  sizeBucket: string;
  color: string;
  clarity: string;
  q: string;
}

export interface AppState {
  batches: Batch[];
  gems: Gem[];
  /** "all" 表示全部批次 */
  activeBatchId: string;
  view: "board" | "orders";
  filters: Filters;
}

const LS_KEY = "gem-workbench-v1";

export function defaultState(): AppState {
  return {
    batches: [],
    gems: [],
    activeBatchId: "all",
    view: "board",
    filters: { shape: "", sizeBucket: "", color: "", clarity: "", q: "" },
  };
}

/** 从 localStorage 恢复草稿;数据损坏时回退到空状态 */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw) as Partial<AppState>;
    const d = defaultState();
    return {
      batches: Array.isArray(s.batches) ? s.batches : [],
      gems: Array.isArray(s.gems) ? s.gems : [],
      activeBatchId: typeof s.activeBatchId === "string" ? s.activeBatchId : "all",
      view: s.view === "orders" ? "orders" : "board",
      filters: { ...d.filters, ...(s.filters ?? {}) },
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // 存储满等异常不阻断使用
  }
}
