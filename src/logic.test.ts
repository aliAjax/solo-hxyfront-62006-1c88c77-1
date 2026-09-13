/**
 * 走查脚本:从建批到订单清单的全流程逻辑验证。
 * 运行:npx esbuild src/logic.test.ts --bundle --platform=node --outfile=node_modules/.tmp/logic.test.cjs && node node_modules/.tmp/logic.test.cjs
 */
import assert from "node:assert";
import * as L from "./logic";
import type { Gem, GemFields } from "./types";

const f = (over: Partial<GemFields>): GemFields => ({
  code: "",
  type: "钻石",
  shape: "圆形",
  carat: "",
  size: "",
  clarity: "VS1",
  color: "",
  cut: "VG",
  position: "主石",
  orderNo: "",
  ...over,
});

/* 1. 建批 */
const batchA = L.createBatch("2026-09 蓝宝来料", "供应商 X");
const batchB = L.createBatch("2026-09 钻饰配石", "");
assert.ok(batchA.id !== batchB.id, "批次 ID 应唯一");
console.log("✓ 1. 建批");

/* 2. 录入校验 */
assert.deepStrictEqual(L.validateGemFields(f({})), ["编号不能为空"]);
assert.deepStrictEqual(L.validateGemFields(f({ code: "A", carat: "-1" })), ["克拉必须是不小于 0 的数字"]);
assert.deepStrictEqual(L.validateGemFields(f({ code: "A", carat: "abc" })), ["克拉必须是不小于 0 的数字"]);
assert.deepStrictEqual(L.validateGemFields(f({ code: "A", carat: "1.25" })), []);
console.log("✓ 2. 录入校验(编号必填、克拉须为非负数字)");

/* 3. 录入宝石,初始状态为待分拣 */
const gems: Gem[] = [
  L.createGem(f({ code: "ST-001", type: "蓝宝石", shape: "椭圆形", carat: "1.20", size: "6×4mm", color: "蓝", orderNo: "ORD-2601" }), batchA.id),
  L.createGem(f({ code: "ST-002", type: "钻石", carat: "0.08", size: "2.6mm", clarity: "VVS1", color: "D", position: "围镶", orderNo: "ORD-2601" }), batchA.id),
  L.createGem(f({ code: "ST-003", type: "祖母绿", shape: "祖母绿形", carat: "1.50", size: "7×5mm", color: "绿", orderNo: "ORD-2602" }), batchA.id),
  L.createGem(f({ code: "ST-004", type: "红宝石", shape: "梨形", carat: "0.60", size: "5×3.5mm", color: "红", position: "吊坠", orderNo: "ORD-2602" }), batchB.id),
];
assert.ok(gems.every((g) => g.status === "pending"));
console.log("✓ 3. 录入 4 颗,均为「待分拣」");

/* 4. 状态机:合法路径 */
assert.ok(L.transitionGem(gems[0], "reviewing").ok, "待分拣→待确认");
assert.ok(L.transitionGem(gems[0], "ready").ok, "待确认→可镶嵌");
assert.ok(L.transitionGem(gems[0], "set").ok, "可镶嵌→已镶嵌");
assert.ok(L.transitionGem(gems[1], "ready").ok, "待分拣→可镶嵌(直走)");
assert.ok(L.transitionGem(gems[1], "set").ok, "可镶嵌→已镶嵌");
console.log("✓ 4. 合法流转:待分拣→待确认→可镶嵌→已镶嵌,及待分拣→可镶嵌");

/* 5. 状态机:非法跳转一律拦截 */
const illegal: [Gem, Parameters<typeof L.transitionGem>[1]][] = [
  [gems[0], "pending"],   // 已镶嵌 → 待分拣
  [gems[0], "reviewing"], // 已镶嵌 → 待确认
  [gems[0], "defect"],    // 已镶嵌 → 缺陷搁置
  [gems[1], "reviewing"], // 已镶嵌 → 待确认
  [gems[2], "set"],       // 待确认(下面先转)→ 跳过可镶嵌直接已镶嵌
];
assert.ok(L.transitionGem(gems[2], "reviewing").ok);
illegal.forEach(([g, to]) => {
  const r = L.transitionGem(g, to);
  assert.ok(!r.ok, `应拦截 ${g.status} → ${to}`);
  assert.match((r as { error: string }).error, /非法跳转/);
});
// 缺陷搁置为终态
assert.ok(L.transitionGem(gems[3], "defect", { reason: "台面崩口" }).ok);
const rDefectExit = L.transitionGem(gems[3], "pending");
assert.ok(!rDefectExit.ok && /非法跳转/.test((rDefectExit as { error: string }).error), "缺陷搁置不可再流转");
// 缺原因不可搁置
const g5 = L.createGem(f({ code: "ST-005" }), batchA.id);
const rNoReason = L.transitionGem(g5, "defect");
assert.ok(!rNoReason.ok && /缺陷原因/.test((rNoReason as { error: string }).error));
assert.equal(g5.status, "pending", "缺原因时状态不应改变");
console.log("✓ 5. 非法跳转全部拦截(终态不可出、不可跳级、缺陷须填原因)");

/* 6. 缺陷记录:原因 + 图片占位 */
assert.equal(gems[3].defectReason, "台面崩口");
assert.equal(gems[3].defectImage, "");
assert.ok(gems[3].history.length >= 1 && gems[3].history[0].to === "defect");
console.log("✓ 6. 缺陷原因与流转历史已记录(图片为空时前端显示占位)");

/* 7. 批量导入:解析、行级报错、文件内查重 */
const csv = [
  "编号,种类,形状,克拉,尺寸,净度,颜色,切工,镶嵌位置,订单号",
  "ST-100,钻石,圆形,0.50,5.2×5.2×3.1mm,VVS1,D,EX,主石,ORD-2601",
  ",红宝石,梨形,0.80,6×4mm,VS2,红,G,副石,ORD-2602",
  "ST-102,祖母绿,祖母绿形,abc,5×5mm,肉眼干净,绿,G,主石,ORD-2602",
  'ST-103,"碧玺, 双色",垫形,1.10,6×6mm,VS1,粉,VG,配石,ORD-2602',
  "ST-100,钻石,圆形,0.30,4.0mm,VS1,E,VG,配石,ORD-2601",
].join("\r\n");
const imp = L.parseImport(csv);
assert.equal(imp.gems.length, 3, "3 条有效(ST-100×2、ST-103)");
assert.equal(imp.errors.length, 2, "2 条错误(缺编号、克拉非法)");
assert.ok(imp.errors[0].includes("第 3 行") && imp.errors[1].includes("第 4 行"), "错误应带行号");
assert.deepStrictEqual(imp.duplicates, [{ code: "ST-100", count: 2 }], "文件内重复编号");
// 有效行保持文件顺序:ST-100(0.50) → ST-103(带引号逗号) → ST-100(0.30)
assert.equal(imp.gems[0].code, "ST-100");
assert.equal(imp.gems[0].carat, "0.50");
assert.equal(imp.gems[1].code, "ST-103");
assert.equal(imp.gems[1].type, "碧玺, 双色", "引号内逗号应正确解析,且位于第 2 条有效记录");
assert.equal(imp.gems[2].code, "ST-100");
assert.equal(imp.gems[2].carat, "0.30");
const imported = imp.gems.map((x) => L.createGem(x, batchB.id));
gems.push(...imported);
console.log("✓ 7. 批量导入:行级校验、引号转义、文件内查重");

/* 8. 导出前查重(跨批次) */
const dups = L.findDuplicates(gems);
assert.equal(dups.length, 1);
assert.equal(dups[0].code, "ST-100");
assert.equal(dups[0].gems.length, 2);
console.log("✓ 8. 导出查重:发现重复编号 ST-100×2");

/* 9. 尺寸分档筛选 */
assert.equal(L.sizeBucket("2.6mm"), "< 3.0mm");
assert.equal(L.sizeBucket("5.2×5.2×3.1mm"), "5.0–6.4mm");
assert.equal(L.sizeBucket("6×4mm"), "5.0–6.4mm");
assert.equal(L.sizeBucket(""), "未标注");
assert.equal(L.sizeBucket("7×5mm"), "≥ 6.5mm");
console.log("✓ 9. 尺寸分档");

/* 10. 订单归集 */
const orders = L.groupByOrder(gems);
const ord1 = orders.find((o) => o.orderNo === "ORD-2601")!;
assert.ok(ord1, "应有 ORD-2601");
assert.equal(ord1.gems.length, 4, "ORD-2601:ST-001、ST-002、ST-100×2");
assert.ok(Math.abs(ord1.totalCarat - (1.2 + 0.08 + 0.5 + 0.3)) < 1e-9, "订单总克拉");
assert.equal(ord1.statusCounts["set"], 2, "ORD-2601 已镶嵌 2 颗");
console.log("✓ 10. 订单归集:清单、总克拉、状态统计");

/* 11. 导出摘要 CSV */
const out = L.buildExportCSV(gems, (id) => (id === batchA.id ? batchA.name : id === batchB.id ? batchB.name : "?"));
assert.ok(out.includes("总颗数,7"), "摘要含总颗数(4 录入 + 3 导入)");
assert.ok(out.includes("状态统计"), "摘要含状态统计");
assert.ok(out.includes("已镶嵌 2"), "状态统计:已镶嵌 2");
assert.ok(out.includes("缺陷搁置 1"), "状态统计:缺陷搁置 1");
assert.ok(out.includes("ST-100") && out.includes("台面崩口"), "明细含编号与缺陷原因");
assert.ok(out.charCodeAt(0) === 0xfeff, "带 BOM,Excel 可直接打开");
console.log("✓ 11. 导出摘要 CSV(汇总 + 明细 + BOM)");

console.log("\n全部走查通过:建批 → 录入/导入 → 状态流转(非法拦截)→ 缺陷记录 → 订单清单 → 导出查重 ✅");
