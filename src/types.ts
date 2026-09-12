/** 分拣状态:待分拣 → 待确认 / 可镶嵌 / 已镶嵌 / 缺陷搁置 */
export type Status = "pending" | "reviewing" | "ready" | "set" | "defect";

export interface TransitionRecord {
  from: Status;
  to: Status;
  at: string;
  note: string;
}

export interface Gem {
  id: string;
  batchId: string;
  /** 编号 */
  code: string;
  /** 种类 */
  type: string;
  /** 形状 */
  shape: string;
  /** 克拉重量 */
  carat: number | "";
  /** 尺寸,如 5.2×5.2×3.1mm */
  size: string;
  /** 净度 */
  clarity: string;
  /** 颜色 */
  color: string;
  /** 切工 */
  cut: string;
  /** 镶嵌位置 */
  position: string;
  /** 订单号 */
  orderNo: string;
  status: Status;
  defectReason: string;
  /** 缺陷图片(URL,空串则用占位图) */
  defectImage: string;
  history: TransitionRecord[];
  createdAt: string;
}

export interface Batch {
  id: string;
  name: string;
  note: string;
  createdAt: string;
}

/** 录入 / 导入时的原始字段(克拉还是字符串) */
export interface GemFields {
  code: string;
  type: string;
  shape: string;
  carat: string;
  size: string;
  clarity: string;
  color: string;
  cut: string;
  position: string;
  orderNo: string;
}

export interface DuplicateGroup {
  code: string;
  gems: Gem[];
}

export interface OrderGroup {
  orderNo: string;
  gems: Gem[];
  totalCarat: number;
  statusCounts: Partial<Record<Status, number>>;
}
