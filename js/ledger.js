/* 账本：售出过账、退回冲销与合计。只负责账目计算和条目状态流转，不碰页面。 */
const Ledger = (() => {
  const RECEIVABLE = "作者应收";
  const STATES = { OPEN: "应收", PENDING: "待冲销", DONE: "已冲销" };

  const round2 = n => Math.round(n * 100) / 100;

  // 作者应收 = 成交额 × (1 − 佣金比例)
  function receivableAmount(saleAmount, commissionRate) {
    return round2(saleAmount * (1 - commissionRate / 100));
  }

  // 售出过账：按成交额生成一笔作者应收
  function postSale({ note, work, saleAmount, now }) {
    const amount = receivableAmount(saleAmount, note.commissionRate);
    return {
      id: crypto.randomUUID(),
      noteId: note.id,
      workId: work.id,
      workTheme: work.theme,
      gallery: note.gallery,
      type: RECEIVABLE,
      state: STATES.OPEN,
      saleAmount: round2(saleAmount),
      commissionRate: note.commissionRate,
      commissionAmount: round2(saleAmount - amount),
      amount,
      createdAt: new Date().toISOString(),
      logs: [`${now} 售出过账：成交额 ¥${round2(saleAmount)}，佣金 ${note.commissionRate}%，作者应收 ¥${amount}`]
    };
  }

  // 售后退回：原先的应收转成待冲销
  function markPendingWriteOff(entry, now) {
    if (!entry || entry.state !== STATES.OPEN) return false;
    entry.state = STATES.PENDING;
    entry.logs.push(`${now} 售后退回，应收转待冲销`);
    return true;
  }

  // 确认冲销：待冲销 → 已冲销
  function writeOff(entry, now) {
    if (!entry || entry.state !== STATES.PENDING) return false;
    entry.state = STATES.DONE;
    entry.logs.push(`${now} 冲销完成`);
    return true;
  }

  function totals(entries) {
    const sum = state => round2(entries.filter(e => e.state === state).reduce((s, e) => s + e.amount, 0));
    return { [STATES.OPEN]: sum(STATES.OPEN), [STATES.PENDING]: sum(STATES.PENDING), [STATES.DONE]: sum(STATES.DONE) };
  }

  return { postSale, markPendingWriteOff, writeOff, totals, receivableAmount, STATES };
})();
