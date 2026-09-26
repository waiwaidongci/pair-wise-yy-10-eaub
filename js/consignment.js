/* 寄卖判定：只依赖传入的数据做判断，不碰页面和存储。
   规则：待交付且无缺陷的作品才能签寄卖单；同一作品同一时间只允许一张未结束寄卖单。 */
const ConsignmentRules = (() => {
  const NOTE_OPEN = "进行中";

  // 未结束 = 进行中且结束日期未过
  function isOpen(note, today) {
    return note.status === NOTE_OPEN && note.end >= today;
  }

  // 作品当前被哪张寄卖单占住档期（没有则返回 null）
  function activeNoteFor(workId, notes, today) {
    return notes.find(n => n.workId === workId && isOpen(n, today)) || null;
  }

  // 能否签订：状态、缺陷、档期三道判断；被占住时带上原单
  function canConsign(work, notes, today) {
    if (!work) return { ok: false, reason: "作品不存在" };
    if (work.status !== "待交付") return { ok: false, reason: `当前状态为「${work.status}」，只有待交付作品可以寄卖` };
    if (work.defect) return { ok: false, reason: `存在缺陷（${work.defect}），需先修复再寄卖` };
    const conflict = activeNoteFor(work.id, notes, today);
    if (conflict) return { ok: false, reason: "档期已被其他画廊占住", conflict };
    return { ok: true };
  }

  // 寄卖单内容校验：画廊、起止日期、售价、佣金比例都要写清
  function validateDraft(draft) {
    const errors = {};
    if (!draft.gallery || !draft.gallery.trim()) errors.gallery = "请填写画廊";
    if (!draft.start) errors.start = "请选择起始日期";
    if (!draft.end) errors.end = "请选择结束日期";
    if (draft.start && draft.end && draft.end < draft.start) errors.end = "结束日期不能早于起始日期";
    if (!(Number(draft.price) > 0)) errors.price = "售价需大于 0";
    const rate = Number(draft.commissionRate);
    if (!(rate >= 0 && rate <= 100)) errors.commissionRate = "佣金比例需在 0–100 之间";
    return { ok: Object.keys(errors).length === 0, errors };
  }

  const canSell = note => !!note && note.status === NOTE_OPEN;
  const canReturn = note => !!note && note.status === "已售出";

  return { isOpen, activeNoteFor, canConsign, validateDraft, canSell, canReturn };
})();
