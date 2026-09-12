import { useMemo, useState } from "react";
import type { Batch, DuplicateGroup, Gem, GemFields, OrderGroup, Status } from "./types";
import { OPTIONS, SIZE_BUCKETS, STATUSES, STATUS_ORDER, TRANSITIONS, emptyGemFields, parseImport, validateGemFields } from "./logic";
import type { ImportResult } from "./logic";
import type { Filters } from "./store";

/* ---------- 通用 ---------- */

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal-wide" : ""}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface ToastItem {
  id: number;
  msg: string;
  kind: "ok" | "error";
}

export function ToastList({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-root">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ---------- 批次侧边栏 ---------- */

export function BatchSidebar({
  batches,
  gems,
  activeBatchId,
  onSelect,
  onCreate,
  onDelete,
}: {
  batches: Batch[];
  gems: Gem[];
  activeBatchId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (b: Batch) => void;
}) {
  const countOf = (id: string) => gems.filter((g) => g.batchId === id).length;
  return (
    <aside className="sidebar">
      <div className="side-head">
        <span>分拣批次</span>
        <button className="btn small primary" onClick={onCreate}>
          + 新建批次
        </button>
      </div>
      <ul className="batch-list">
        <li className={activeBatchId === "all" ? "active" : ""} onClick={() => onSelect("all")}>
          <span className="batch-name">全部批次</span>
          <span className="batch-count">{gems.length}</span>
        </li>
        {batches.map((b) => (
          <li key={b.id} className={activeBatchId === b.id ? "active" : ""} onClick={() => onSelect(b.id)}>
            <span className="batch-name" title={b.note}>
              {b.name}
            </span>
            <span className="batch-count">{countOf(b.id)}</span>
            <button
              className="icon-btn danger"
              title="删除批次"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(b);
              }}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
      {batches.length === 0 && <p className="side-tip">还没有批次,先新建一个批次开始分拣。</p>}
    </aside>
  );
}

/* ---------- 筛选与统计 ---------- */

export function FilterBar({ filters, gems, onChange }: { filters: Filters; gems: Gem[]; onChange: (patch: Partial<Filters>) => void }) {
  const distinct = (key: "color" | "clarity") => {
    const set = new Set<string>(OPTIONS[key === "color" ? "colors" : "clarities"]);
    gems.forEach((g) => g[key] && set.add(g[key]));
    return [...set];
  };
  return (
    <div className="filter-bar">
      <label>
        形状
        <select value={filters.shape} onChange={(e) => onChange({ shape: e.target.value })}>
          <option value="">全部</option>
          {OPTIONS.shapes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        尺寸
        <select value={filters.sizeBucket} onChange={(e) => onChange({ sizeBucket: e.target.value })}>
          <option value="">全部</option>
          {SIZE_BUCKETS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        颜色
        <select value={filters.color} onChange={(e) => onChange({ color: e.target.value })}>
          <option value="">全部</option>
          {distinct("color").map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        净度
        <select value={filters.clarity} onChange={(e) => onChange({ clarity: e.target.value })}>
          <option value="">全部</option>
          {distinct("clarity").map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="filter-search">
        搜索
        <input placeholder="编号 / 订单号" value={filters.q} onChange={(e) => onChange({ q: e.target.value })} />
      </label>
    </div>
  );
}

export function StatsBar({ gems }: { gems: Gem[] }) {
  const totalCarat = gems.reduce((s, g) => s + (Number(g.carat) || 0), 0);
  const count = (s: Status) => gems.filter((g) => g.status === s).length;
  return (
    <div className="stats-bar">
      <span className="stat">共 <b>{gems.length}</b> 颗</span>
      <span className="stat">总克拉 <b>{totalCarat.toFixed(2)}</b></span>
      {STATUS_ORDER.map((s) => (
        <span key={s} className={`stat badge-${s}`}>
          {STATUSES[s]} <b>{count(s)}</b>
        </span>
      ))}
    </div>
  );
}

/* ---------- 镶嵌位置示意图 ---------- */

const POSITION_MARKS: Record<string, { x: number; y: number }[]> = {
  主石: [{ x: 100, y: 48 }],
  副石: [
    { x: 68, y: 52 },
    { x: 132, y: 52 },
  ],
  围镶: [
    { x: 84, y: 26 },
    { x: 116, y: 26 },
  ],
  配石: [
    { x: 56, y: 78 },
    { x: 144, y: 78 },
  ],
  戒臂: [
    { x: 42, y: 118 },
    { x: 158, y: 118 },
  ],
  吊坠: [{ x: 100, y: 10 }],
  耳饰: [{ x: 20, y: 30 }],
  手链: [{ x: 180, y: 30 }],
};

export function PositionMap({ gems }: { gems: Gem[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    gems.forEach((g) => m.set(g.position, (m.get(g.position) ?? 0) + 1));
    return m;
  }, [gems]);
  return (
    <section className="position-map panel">
      <h3>镶嵌位置示意</h3>
      <div className="position-body">
        <svg viewBox="0 0 200 160" className="ring-svg" role="img" aria-label="镶嵌位置示意图">
          {/* 戒圈 */}
          <circle cx="100" cy="105" r="48" fill="none" stroke="#d9e2ef" strokeWidth="9" />
          <circle cx="100" cy="105" r="48" fill="none" stroke="#b8c4d6" strokeWidth="1.5" />
          {/* 主石托 */}
          <circle cx="100" cy="48" r="17" fill="none" stroke="#b8c4d6" strokeWidth="2" />
          {Object.entries(POSITION_MARKS).map(([pos, marks]) =>
            marks.map((m, i) => {
              const n = counts.get(pos) ?? 0;
              return (
                <g key={`${pos}-${i}`}>
                  <circle cx={m.x} cy={m.y} r={pos === "主石" ? 11 : 8} className={n > 0 ? "mark mark-on" : "mark"} />
                  {n > 0 && (
                    <text x={m.x} y={m.y + 3.5} textAnchor="middle" className="mark-num">
                      {n}
                    </text>
                  )}
                </g>
              );
            })
          )}
        </svg>
        <ul className="position-legend">
          {OPTIONS.positions.map((p) => (
            <li key={p} className={(counts.get(p) ?? 0) > 0 ? "on" : ""}>
              <span>{p}</span>
              <b>{counts.get(p) ?? 0}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- 分拣台表格 ---------- */

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUSES[status]}</span>;
}

export function GemTable({
  gems,
  batchNameOf,
  onTransition,
  onDelete,
}: {
  gems: Gem[];
  batchNameOf: (id: string) => string;
  onTransition: (gem: Gem, to: Status) => void;
  onDelete: (gem: Gem) => void;
}) {
  if (!gems.length) return <div className="empty">当前筛选下没有宝石。录入单颗或批量导入开始分拣。</div>;
  return (
    <div className="table-wrap">
      <table className="gem-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>种类</th>
            <th>形状</th>
            <th>克拉</th>
            <th>尺寸</th>
            <th>净度</th>
            <th>颜色</th>
            <th>切工</th>
            <th>镶嵌位置</th>
            <th>订单号</th>
            <th>批次</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {gems.map((g) => (
            <tr key={g.id}>
              <td className="code">{g.code}</td>
              <td>{g.type}</td>
              <td>{g.shape}</td>
              <td>{g.carat === "" ? "—" : g.carat}</td>
              <td>{g.size || "—"}</td>
              <td>{g.clarity || "—"}</td>
              <td>{g.color || "—"}</td>
              <td>{g.cut || "—"}</td>
              <td>
                <span className="pos-tag">{g.position}</span>
              </td>
              <td>{g.orderNo || "—"}</td>
              <td>{batchNameOf(g.batchId)}</td>
              <td>
                <StatusBadge status={g.status} />
                {g.status === "defect" && (
                  <div className="defect-info">
                    {g.defectImage ? <img src={g.defectImage} alt="缺陷图" className="defect-thumb" /> : <span className="defect-placeholder">🖼 图片占位</span>}
                    <span className="defect-reason" title={g.defectReason}>
                      {g.defectReason}
                    </span>
                  </div>
                )}
              </td>
              <td className="actions">
                {TRANSITIONS[g.status].map((to) => (
                  <button key={to} className={`btn tiny flow-${to}`} title={`流转为${STATUSES[to]}`} onClick={() => onTransition(g, to)}>
                    →{STATUSES[to]}
                  </button>
                ))}
                {TRANSITIONS[g.status].length === 0 && <span className="terminal">终态</span>}
                <button className="icon-btn danger" title="删除" onClick={() => onDelete(g)}>
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 订单视图 ---------- */

export function OrderView({ groups, batchNameOf }: { groups: OrderGroup[]; batchNameOf: (id: string) => string }) {
  if (!groups.length) return <div className="empty">还没有可归集的宝石。</div>;
  return (
    <div className="order-list">
      {groups.map((o) => (
        <section key={o.orderNo} className="order-card panel">
          <header>
            <h3>{o.orderNo}</h3>
            <div className="order-meta">
              <span>{o.gems.length} 颗</span>
              <span>共 {o.totalCarat.toFixed(2)} ct</span>
              {STATUS_ORDER.filter((s) => o.statusCounts[s]).map((s) => (
                <span key={s} className={`badge badge-${s}`}>
                  {STATUSES[s]} {o.statusCounts[s]}
                </span>
              ))}
            </div>
          </header>
          <table className="gem-table compact">
            <thead>
              <tr>
                <th>编号</th>
                <th>种类</th>
                <th>形状</th>
                <th>克拉</th>
                <th>尺寸</th>
                <th>净度</th>
                <th>颜色</th>
                <th>镶嵌位置</th>
                <th>批次</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {o.gems.map((g) => (
                <tr key={g.id}>
                  <td className="code">{g.code}</td>
                  <td>{g.type}</td>
                  <td>{g.shape}</td>
                  <td>{g.carat === "" ? "—" : g.carat}</td>
                  <td>{g.size || "—"}</td>
                  <td>{g.clarity || "—"}</td>
                  <td>{g.color || "—"}</td>
                  <td>
                    <span className="pos-tag">{g.position}</span>
                  </td>
                  <td>{batchNameOf(g.batchId)}</td>
                  <td>
                    <StatusBadge status={g.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

/* ---------- 弹窗:新建批次 ---------- */

export function BatchModal({ onSubmit, onClose }: { onSubmit: (name: string, note: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="新建分拣批次" onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name, note);
        }}
      >
        <label>
          批次名称 *
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="如 2026-09 蓝宝来料" />
        </label>
        <label>
          备注
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="供应商 / 来料说明(可选)" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            创建批次
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- 弹窗:录入宝石 ---------- */

export function GemFormModal({
  batches,
  defaultBatchId,
  onSubmit,
  onClose,
}: {
  batches: Batch[];
  defaultBatchId: string;
  onSubmit: (fields: GemFields, batchId: string) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<GemFields>(emptyGemFields());
  const [batchId, setBatchId] = useState(defaultBatchId);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (k: keyof GemFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields({ ...fields, [k]: e.target.value });
  const sel = (key: keyof GemFields, label: string, options: string[]) => (
    <label>
      {label}
      <select value={fields[key]} onChange={set(key)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
  return (
    <Modal title="录入宝石" onClose={onClose} wide>
      <form
        className="form-grid two-col"
        onSubmit={(e) => {
          e.preventDefault();
          const errs = validateGemFields(fields);
          setErrors(errs);
          if (!errs.length) onSubmit(fields, batchId);
        }}
      >
        <label>
          所属批次 *
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          编号 *
          <input autoFocus value={fields.code} onChange={set("code")} placeholder="如 ST-2048" />
        </label>
        {sel("type", "种类", OPTIONS.types)}
        {sel("shape", "形状", OPTIONS.shapes)}
        <label>
          克拉
          <input type="number" min="0" step="0.01" value={fields.carat} onChange={set("carat")} placeholder="如 1.25" />
        </label>
        <label>
          尺寸
          <input value={fields.size} onChange={set("size")} placeholder="如 5.2×5.2×3.1mm" />
        </label>
        {sel("clarity", "净度", OPTIONS.clarities)}
        <label>
          颜色
          <input list="color-options" value={fields.color} onChange={set("color")} placeholder="钻石填 D–K,彩宝填颜色" />
          <datalist id="color-options">
            {OPTIONS.colors.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        {sel("cut", "切工", OPTIONS.cuts)}
        {sel("position", "镶嵌位置", OPTIONS.positions)}
        <label>
          订单号
          <input value={fields.orderNo} onChange={set("orderNo")} placeholder="如 ORD-2601(可选)" />
        </label>
        {errors.length > 0 && (
          <div className="form-errors">
            {errors.map((e) => (
              <p key={e}>⚠ {e}</p>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn primary">
            保存(状态:待分拣)
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- 弹窗:批量导入 ---------- */

export const IMPORT_TEMPLATE = "编号,种类,形状,克拉,尺寸,净度,颜色,切工,镶嵌位置,订单号";

export function ImportModal({
  batches,
  defaultBatchId,
  onImport,
  onClose,
}: {
  batches: Batch[];
  defaultBatchId: string;
  onImport: (gems: GemFields[], batchId: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [batchId, setBatchId] = useState(defaultBatchId);
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  return (
    <Modal title="批量导入宝石(CSV)" onClose={onClose} wide>
      <div className="form-grid">
        <label>
          导入到批次
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          CSV 内容(首行表头:{IMPORT_TEMPLATE})
          <textarea rows={8} value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }} placeholder={IMPORT_TEMPLATE + "\nST-3001,蓝宝石,椭圆形,1.20,6×4mm,VS1,蓝,VG,主石,ORD-2601"} />
        </label>
        <div className="import-actions">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => {
                setText(String(reader.result ?? ""));
                setParsed(null);
              };
              reader.readAsText(f);
            }}
          />
          <button type="button" className="btn" onClick={() => setParsed(parseImport(text))} disabled={!text.trim()}>
            解析校验
          </button>
        </div>
        {parsed && (
          <div className="import-result">
            <p>
              可导入 <b>{parsed.gems.length}</b> 条;错误 <b>{parsed.errors.length}</b> 条
              {parsed.duplicates.length > 0 && (
                <span className="warn">;文件内重复编号:{parsed.duplicates.map((d) => `${d.code}×${d.count}`).join("、")}</span>
              )}
            </p>
            {parsed.errors.length > 0 && (
              <ul className="error-list">
                {parsed.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn primary" disabled={!parsed || parsed.gems.length === 0} onClick={() => parsed && onImport(parsed.gems, batchId)}>
            确认导入 {parsed ? parsed.gems.length : 0} 条
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- 弹窗:缺陷搁置 ---------- */

export function DefectModal({ gem, onSubmit, onClose }: { gem: Gem; onSubmit: (reason: string, image: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [image, setImage] = useState("");
  const [tried, setTried] = useState(false);
  return (
    <Modal title={`缺陷搁置 · ${gem.code}`} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (reason.trim()) onSubmit(reason, image);
        }}
      >
        <label>
          缺陷原因 *
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如:台面崩口 / 内含物明显 / 色差超预期" />
        </label>
        {tried && !reason.trim() && <p className="warn">必须填写缺陷原因才能搁置</p>}
        <label>
          缺陷图片 URL(可选,不上传文件,仅占位)
          <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://… 或留空使用占位图" />
        </label>
        <div className="defect-preview">
          {image ? <img src={image} alt="缺陷图预览" /> : <span>🖼 图片占位</span>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn danger-solid">
            确认搁置
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- 弹窗:导出前重复编号提醒 ---------- */

export function DuplicatesModal({
  dups,
  batchNameOf,
  onContinue,
  onCancel,
}: {
  dups: DuplicateGroup[];
  batchNameOf: (id: string) => string;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={`导出检查发现 ${dups.length} 个重复编号`} onClose={onCancel} wide>
      <div className="dup-list">
        {dups.map((d) => (
          <div key={d.code} className="dup-item">
            <b>{d.code}</b>
            <span>
              出现 {d.gems.length} 次:
              {d.gems.map((g) => `${batchNameOf(g.batchId)}${g.orderNo ? ` / ${g.orderNo}` : ""}`).join(";")}
            </span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>
          取消导出
        </button>
        <button type="button" className="btn primary" onClick={onContinue}>
          仍然导出
        </button>
      </div>
    </Modal>
  );
}
