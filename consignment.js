/* 寄卖判定：只负责判断能不能签、档期有没有被占，不碰页面和存储 */
window.Consignment = (() => {
  // 未结束 = 仍在寄卖中，且结束日期未过
  function isOpen(order, today) {
    return order.status === "寄卖中" && order.end >= today;
  }

  // 作品当前被哪张未结束寄卖单占住档期
  function openOrderFor(orders, workId, today) {
    return orders.find(o => o.workId === workId && isOpen(o, today)) || null;
  }

  // 签约判定：待交付、无缺陷、未售出过、没有未结束寄卖单
  function checkSignable(work, orders, today) {
    if (!work) return { ok: false, reason: "请选择要寄卖的作品" };
    if (work.status !== "待交付") return { ok: false, reason: `「${work.theme}」当前为${work.status}，只有待交付作品能签寄卖单` };
    if (work.defect) return { ok: false, reason: `「${work.theme}」有缺陷（${work.defect}），修复前不能寄卖` };
    if (orders.some(o => o.workId === work.id && o.status === "已售出")) {
      return { ok: false, reason: `「${work.theme}」已售出，不能再签寄卖单` };
    }
    const conflict = openOrderFor(orders, work.id, today);
    if (conflict) return { ok: false, reason: "档期已被占住", conflict };
    return { ok: true };
  }

  // 寄卖单字段校验
  function validateOrderInput(input) {
    const errors = [];
    if (!input.gallery) errors.push("请填写画廊名称");
    if (!input.start) errors.push("请选择起始日期");
    if (!input.end) errors.push("请选择结束日期");
    if (input.start && input.end && input.end < input.start) errors.push("结束日期不能早于起始日期");
    if (!(input.price > 0)) errors.push("售价需大于 0");
    if (!(input.rate >= 0 && input.rate <= 100)) errors.push("佣金率需在 0–100 之间");
    return { ok: errors.length === 0, errors };
  }

  // 列表展示用状态：寄卖中 / 已到期 / 已售出 / 已退回
  function displayStatus(order, today) {
    if (order.status === "寄卖中" && order.end < today) return "已到期";
    return order.status;
  }

  return { isOpen, openOrderFor, checkSignable, validateOrderInput, displayStatus };
})();
