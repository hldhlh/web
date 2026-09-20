(function (root) {
  "use strict";
  const items = ["吊龙", "板腱", "花趾", "碎肉", "胸口油", "极品雪花"];
  const orderItems = [...items, "牛大肚", "牛小肠", "牛肋条"];
  const units = ["", "kg", "斤", "条", "件", "份"];
  const workflows = {
    count: { title: "盘肉报货", storageKey: "academy-meat-count-v1", primary: "剩余库存", step: "库存", done: "已盘", pending: "待盘", zero: "无库存 · 0", verb: "盘点", preview: "报货预览", copy: "复制报货文本", compound: true },
    arrival: { title: "到货", storageKey: "academy-meat-arrival-v1", primary: "实收重量", step: "到货", done: "已核对", pending: "待核对", zero: "未到货 · 0", verb: "核对", preview: "到货预览", copy: "复制到货文本", compound: false },
    morning: { title: "明早报货", storageKey: "academy-meat-morning-v1", primary: "明早需订数量", step: "明早订货", done: "已确认", pending: "待填写", zero: "不订此项", verb: "填写", preview: "明早报货预览", copy: "复制报货文本", compound: false }
  };
  const valid = value => typeof value === "string" && /^\d{1,5}(?:\.\d{1,3})?$/.test(value);
  const normalize = value => valid(value) ? String(Number(value)) : "";
  const empty = (kind = "count") => ({ stock: items.map(() => ""), checked: items.map(() => false), orders: orderItems.map(() => ""), units: (kind === "count" ? orderItems : items).map(() => kind === "morning" ? "kg" : ""), updatedAt: "" });
  function initial(kind = "count") {
    const draft = empty(kind);
    if (kind !== "count") return draft;
    draft.stock = ["2", "2.5", "0", "2.6", "1.5", "0"];
    draft.checked = draft.stock.map(valid);
    draft.orders[1] = "2";
    return draft;
  }
  function restore(raw, kind = "count") {
    if (!raw || typeof raw !== "object") return initial(kind);
    const draft = empty(kind);
    items.forEach((_, index) => {
      draft.stock[index] = normalize(raw.stock?.[index]);
      draft.checked[index] = valid(draft.stock[index]);

    });
    orderItems.forEach((_, index) => { draft.orders[index] = normalize(raw.orders?.[index]); });
    draft.units.forEach((_, index) => { draft.units[index] = units.includes(raw.units?.[index]) ? raw.units[index] : ""; });
    draft.updatedAt = typeof raw.updatedAt === "string" && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : "";
    return draft;
  }
  function setValue(draft, mode, index, value) {
    if (!Number.isInteger(index) || index < 0 || index >= (mode === "orders" ? orderItems.length : items.length) || !["stock", "orders"].includes(mode)) return false;
    if (value !== "" && !valid(value)) return false;
    draft[mode][index] = normalize(value);
    if (mode === "stock") draft.checked[index] = valid(draft.stock[index]);
    return true;
  }
  function confirmStock(draft, index) {
    if (!valid(draft.stock[index])) return false;
    draft.checked[index] = true;
    return true;
  }
  function missing(draft) {
    return items.map((_, i) => i).filter(i => !valid(draft.stock[i]));
  }
  function report(draft, kind = "count") {
    const confirmed = i => valid(draft.stock[i]);
    if (kind === "arrival" || kind === "morning") {
      const lines = items.flatMap((name, i) => {
        if (!confirmed(i)) return [];
        const value = kind === "morning" && Number(draft.stock[i]) === 0 ? "不订" : `${normalize(draft.stock[i])}${kind === "arrival" ? "kg" : draft.units[i]}`;
        return [`${name}：${value}`];
      });
      if (!lines.length) return "";
      return kind === "arrival" ? `缦云店到货:\n${lines.join("\n")}` : `缦云店明早报货:\n明早订货：\n${lines.join("\n")}`;
    }
    // The order template requires a real, confirmed tenderloin remainder.
    if (!confirmed(0)) return "";
    const stock = items.flatMap((name, i) => confirmed(i) ? [`${name}：${normalize(draft.stock[i])}kg`] : []);
    const orders = orderItems.flatMap((name, i) => valid(draft.orders[i]) && Number(draft.orders[i]) > 0 ? [`${name}${normalize(draft.orders[i])}${draft.units[i]}`] : []);
    const sections = [];
    if (stock.length) sections.push(`剩余库存\n${stock.join("\n")}`);
    sections.push(`明日订货：\n${orders.length ? orders.join("\n") : "不需要货"}`);
    const tail = `\n缦云吊龙剩余${normalize(draft.stock[0])}kg`;
    return `缦云店报货:\n${sections.join("\n\n")}${tail}`;
  }
  const api = { workflows, items, orderItems, units, valid, normalize, empty, initial, restore, setValue, confirmStock, missing, report };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MeatTemplate = api;
})(globalThis);
