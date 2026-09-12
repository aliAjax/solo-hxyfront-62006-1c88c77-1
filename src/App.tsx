import { useEffect, useMemo, useState } from "react";
import type { Batch, Gem, GemFields, Status } from "./types";
import {
  STATUSES,
  buildExportCSV,
  createBatch,
  createGem,
  findDuplicates,
  groupByOrder,
  sizeBucket,
  transitionGem,
  validateGemFields,
} from "./logic";
import { defaultState, loadState, saveState } from "./store";
import type { AppState, Filters } from "./store";
import {
  BatchModal,
  BatchSidebar,
  DefectModal,
  DuplicatesModal,
  FilterBar,
  GemFormModal,
  GemTable,
  ImportModal,
  OrderView,
  PositionMap,
  StatsBar,
  ToastList,
} from "./components";
import type { ToastItem } from "./components";
import type { DuplicateGroup } from "./types";

type ModalState =
  | { kind: "batch" }
  | { kind: "gem" }
  | { kind: "import" }
  | { kind: "defect"; gem: Gem }
  | { kind: "dups"; dups: DuplicateGroup[] }
  | null;

let toastSeq = 1;

function App() {
  const [state, setState] = useState<AppState>(() => {
    try {
      return loadState();
    } catch {
      return defaultState();
    }
  });
  const [modal, setModal] = useState<ModalState>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // 草稿持久化:任何变化都写入 localStorage,刷新/重开自动恢复
  useEffect(() => {
    saveState(state);
  }, [state]);

  const toast = (msg: string, kind: ToastItem["kind"] = "ok") => {
    const id = toastSeq++;
    setToasts((ts) => [...ts, { id, msg, kind }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3600);
  };

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }));
  const patchFilters = (p: Partial<Filters>) => setState((s) => ({ ...s, filters: { ...s.filters, ...p } }));

  const batchNameOf = (id: string) => state.batches.find((b) => b.id === id)?.name ?? "(已删批次)";

  /* ---------- 筛选 ---------- */
  const filteredGems = useMemo(() => {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    return state.gems.filter((g) => {
      if (state.activeBatchId !== "all" && g.batchId !== state.activeBatchId) return false;
      if (f.shape && g.shape !== f.shape) return false;
      if (f.sizeBucket && sizeBucket(g.size) !== f.sizeBucket) return false;
      if (f.color && g.color !== f.color) return false;
      if (f.clarity && g.clarity !== f.clarity) return false;
      if (q && !g.code.toLowerCase().includes(q) && !g.orderNo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [state.gems, state.activeBatchId, state.filters]);

  const orderGroups = useMemo(() => groupByOrder(filteredGems), [filteredGems]);

  /* ---------- 批次 ---------- */
  const addBatch = (name: string, note: string) => {
    const b = createBatch(name, note);
    setState((s) => ({ ...s, batches: [...s.batches, b], activeBatchId: b.id }));
    setModal(null);
    toast(`批次「${b.name}」已创建`);
  };

  const deleteBatch = (b: Batch) => {
    const n = state.gems.filter((g) => g.batchId === b.id).length;
    if (!window.confirm(`删除批次「${b.name}」?其中的 ${n} 颗宝石记录将一并删除。`)) return;
    setState((s) => ({
      ...s,
      batches: s.batches.filter((x) => x.id !== b.id),
      gems: s.gems.filter((g) => g.batchId !== b.id),
      activeBatchId: s.activeBatchId === b.id ? "all" : s.activeBatchId,
    }));
    toast(`批次「${b.name}」已删除`);
  };

  /* ---------- 宝石录入 / 导入 ---------- */
  const addGem = (fields: GemFields, batchId: string) => {
    const gem = createGem(fields, batchId);
    setState((s) => ({ ...s, gems: [...s.gems, gem] }));
    setModal(null);
    const dup = state.gems.some((g) => g.code === gem.code);
    toast(dup ? `已保存「${gem.code}」,注意:该编号与已有记录重复` : `「${gem.code}」已录入,状态:待分拣`, dup ? "error" : "ok");
  };

  const importGems = (list: GemFields[], batchId: string) => {
    const gems = list.map((f) => createGem(f, batchId));
    setState((s) => ({ ...s, gems: [...s.gems, ...gems] }));
    setModal(null);
    toast(`已导入 ${gems.length} 颗宝石到「${batchNameOf(batchId)}」`);
  };

  const deleteGem = (gem: Gem) => {
    if (!window.confirm(`删除宝石「${gem.code}」?`)) return;
    setState((s) => ({ ...s, gems: s.gems.filter((g) => g.id !== gem.id) }));
  };

  /* ---------- 状态流转(非法跳转在此被拦截) ---------- */
  const requestTransition = (gem: Gem, to: Status) => {
    if (to === "defect") {
      setModal({ kind: "defect", gem });
      return;
    }
    applyTransition(gem.id, to);
  };

  const applyTransition = (gemId: string, to: Status, opts: { reason?: string; image?: string } = {}) => {
    let resultMsg = "";
    let ok = false;
    setState((s) => ({
      ...s,
      gems: s.gems.map((g) => {
        if (g.id !== gemId) return g;
        const copy: Gem = { ...g, history: [...g.history] };
        const r = transitionGem(copy, to, opts);
        if (r.ok) {
          ok = true;
          resultMsg = `「${copy.code}」${STATUSES[r.from]} → ${STATUSES[r.to]}`;
        } else {
          resultMsg = r.error;
        }
        return r.ok ? copy : g;
      }),
    }));
    // setState 回调同步执行,可直接读取结果
    if (ok) {
      setModal(null);
      toast(resultMsg);
    } else if (resultMsg) {
      toast(`已拦截:${resultMsg}`, "error");
    }
  };

  /* ---------- 导出(先查重复编号) ---------- */
  const exportSummary = () => {
    if (!filteredGems.length) {
      toast("当前筛选下没有宝石可导出", "error");
      return;
    }
    const dups = findDuplicates(filteredGems);
    if (dups.length) {
      setModal({ kind: "dups", dups });
      return;
    }
    downloadCSV();
  };

  const downloadCSV = () => {
    const csv = buildExportCSV(filteredGems, batchNameOf);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `宝石分拣摘要_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setModal(null);
    toast(`已导出 ${filteredGems.length} 颗宝石的摘要`);
  };

  /* ---------- 示例数据 ---------- */
  const seedDemo = () => {
    const b = createBatch("示例批次 2026-09", "演示数据,可随时删除");
    const demo: GemFields[] = [
      { code: "ST-2048", type: "蓝宝石", shape: "椭圆形", carat: "1.20", size: "6×4mm", clarity: "VS1", color: "蓝", cut: "VG", position: "主石", orderNo: "ORD-2601" },
      { code: "ST-2049", type: "蓝宝石", shape: "椭圆形", carat: "0.95", size: "5.5×4mm", clarity: "VS2", color: "蓝", cut: "VG", position: "副石", orderNo: "ORD-2601" },
      { code: "ST-2061", type: "钻石", shape: "圆形", carat: "0.08", size: "2.6mm", clarity: "VVS1", color: "D", cut: "EX", position: "围镶", orderNo: "ORD-2601" },
      { code: "ST-2062", type: "钻石", shape: "圆形", carat: "0.08", size: "2.6mm", clarity: "VVS2", color: "E", cut: "EX", position: "围镶", orderNo: "ORD-2601" },
      { code: "ST-2070", type: "红宝石", shape: "梨形", carat: "0.60", size: "5×3.5mm", clarity: "VS1", color: "红", cut: "G", position: "吊坠", orderNo: "ORD-2602" },
      { code: "ST-2071", type: "钻石", shape: "圆形", carat: "0.30", size: "4.3mm", clarity: "SI1", color: "G", cut: "VG", position: "配石", orderNo: "ORD-2602" },
      { code: "ST-2099", type: "祖母绿", shape: "祖母绿形", carat: "1.50", size: "7×5mm", clarity: "肉眼干净", color: "绿", cut: "G", position: "主石", orderNo: "ORD-2602" },
      { code: "ST-2105", type: "钻石", shape: "公主方", carat: "0.45", size: "4×4mm", clarity: "VS2", color: "F", cut: "VG", position: "戒臂", orderNo: "" },
    ];
    const gems = demo.map((f) => createGem(f, b.id));
    // 按合法路径流转演示
    transitionGem(gems[1], "reviewing");
    transitionGem(gems[2], "reviewing");
    transitionGem(gems[2], "ready");
    transitionGem(gems[3], "ready");
    transitionGem(gems[3], "set");
    transitionGem(gems[6], "defect", { reason: "内含物明显,需客户确认", image: "" });
    setState((s) => ({ ...s, batches: [...s.batches, b], gems: [...s.gems, ...gems], activeBatchId: b.id }));
    toast("已载入示例数据(含各状态演示)");
  };

  const noBatches = state.batches.length === 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">💎 宝石分拣工作台</div>
        <nav className="tabs">
          <button className={state.view === "board" ? "tab active" : "tab"} onClick={() => patch({ view: "board" })}>
            分拣台
          </button>
          <button className={state.view === "orders" ? "tab active" : "tab"} onClick={() => patch({ view: "orders" })}>
            订单视图
          </button>
        </nav>
        <div className="top-actions">
          <button className="btn" onClick={() => (noBatches ? toast("请先新建批次", "error") : setModal({ kind: "import" }))}>
            批量导入
          </button>
          <button className="btn" onClick={exportSummary}>
            导出摘要
          </button>
          <button className="btn primary" onClick={() => (noBatches ? toast("请先新建批次", "error") : setModal({ kind: "gem" }))}>
            + 录入宝石
          </button>
        </div>
      </header>

      <div className="layout">
        <BatchSidebar
          batches={state.batches}
          gems={state.gems}
          activeBatchId={state.activeBatchId}
          onSelect={(id) => patch({ activeBatchId: id })}
          onCreate={() => setModal({ kind: "batch" })}
          onDelete={deleteBatch}
        />

        <main className="main">
          {noBatches ? (
            <div className="empty hero-empty">
              <h2>从新建一个分拣批次开始</h2>
              <p>批次用来归集一次来料或一个分拣任务;宝石录入后默认「待分拣」,再按流程流转。</p>
              <div>
                <button className="btn primary" onClick={() => setModal({ kind: "batch" })}>
                  + 新建批次
                </button>
                <button className="btn" onClick={seedDemo}>
                  载入示例数据
                </button>
              </div>
            </div>
          ) : (
            <>
              <FilterBar filters={state.filters} gems={state.gems} onChange={patchFilters} />
              <StatsBar gems={filteredGems} />
              {state.view === "board" ? (
                <>
                  <PositionMap gems={filteredGems} />
                  <GemTable gems={filteredGems} batchNameOf={batchNameOf} onTransition={requestTransition} onDelete={deleteGem} />
                </>
              ) : (
                <OrderView groups={orderGroups} batchNameOf={batchNameOf} />
              )}
            </>
          )}
        </main>
      </div>

      {modal?.kind === "batch" && <BatchModal onSubmit={addBatch} onClose={() => setModal(null)} />}
      {modal?.kind === "gem" && (
        <GemFormModal
          batches={state.batches}
          defaultBatchId={state.activeBatchId === "all" ? state.batches[0]?.id ?? "" : state.activeBatchId}
          onSubmit={addGem}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "import" && (
        <ImportModal
          batches={state.batches}
          defaultBatchId={state.activeBatchId === "all" ? state.batches[0]?.id ?? "" : state.activeBatchId}
          onImport={importGems}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "defect" && (
        <DefectModal gem={modal.gem} onSubmit={(reason, image) => applyTransition(modal.gem.id, "defect", { reason, image })} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "dups" && <DuplicatesModal dups={modal.dups} batchNameOf={batchNameOf} onContinue={downloadCSV} onCancel={() => setModal(null)} />}

      <ToastList toasts={toasts} />
    </div>
  );
}

export default App;
