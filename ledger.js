/* 账本：只负责寄卖钱款的登记与冲销，不碰页面和存储 */
window.Ledger = (() => {
  const round = n => Math.round(n * 100) / 100;

  // 作者应收 = 成交额 × (1 - 佣金率/100)
  function artistShare(dealAmount, rate) {
    return round(dealAmount * (1 - rate / 100));
  }

  // 售出落账：登记一条作者应收
  function recordSale(entries, order, work, dealAmount) {
    const entry = {
      id: crypto.randomUUID(),
      orderId: order.id,
      workId: work.id,
      theme: work.theme,
      gallery: order.gallery,
      dealAmount: round(dealAmount),
      rate: order.rate,
      amount: artistShare(dealAmount, order.rate),
      kind: "应收",
      createdAt: new Date().toISOString().slice(0, 10),
      writeOffAt: "",
      note: ""
    };
    entries.push(entry);
    return entry;
  }

  // 售后退回：该单的应收转成待冲销
  function markWriteOff(entries, orderId, note) {
    const entry = entries.find(e => e.orderId === orderId && e.kind === "应收");
    if (!entry) return null;
    entry.kind = "待冲销";
    entry.writeOffAt = new Date().toISOString().slice(0, 10);
    entry.note = note || "";
    return entry;
  }

  function totals(entries) {
    const sum = kind => round(entries.filter(e => e.kind === kind).reduce((s, e) => s + e.amount, 0));
    return { receivable: sum("应收"), writeOff: sum("待冲销") };
  }

  return { artistShare, recordSale, markWriteOff, totals };
})();
