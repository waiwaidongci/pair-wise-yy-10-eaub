/* 页面层：寄卖单与账本的渲染、交互和 localStorage 持久化。
   判定规则在 js/consignment.js（ConsignmentRules），账目计算在 js/ledger.js（Ledger），
   作品数据、save()、render() 复用 index.html 里的全局。 */
(() => {
  const notesKey = "zfl42ConsignNotes";
  const ledgerKey = "zfl42Ledger";
  let notes = JSON.parse(localStorage.getItem(notesKey) || "[]");
  let ledger = JSON.parse(localStorage.getItem(ledgerKey) || "[]");
  let consignWorkId = null;
  let saleNoteId = null;
  let returnNoteId = null;

  const $ = sel => document.querySelector(sel);
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const stamp = () => new Date().toLocaleString();
  const yuan = n => `¥${Math.round(Number(n) * 100) / 100}`;
  const noteOf = id => notes.find(n => n.id === id);
  const workOf = id => works.find(w => w.id === id);

  function persist() {
    localStorage.setItem(notesKey, JSON.stringify(notes));
    localStorage.setItem(ledgerKey, JSON.stringify(ledger));
  }

  /* ---------- 渲染 ---------- */

  function noteBadge(note) {
    if (note.status === "进行中" && note.end < todayStr()) return `<span class="badge gray">已到期</span>`;
    const cls = note.status === "进行中" ? "" : note.status === "已退回" ? "amber" : "gray";
    return `<span class="badge ${cls}">${note.status}</span>`;
  }

  function renderNotes() {
    const list = $("#noteList");
    if (!notes.length) {
      list.innerHTML = `<div class="empty">暂无寄卖单。待交付且无缺陷的作品可在看板卡片上点「寄卖」签订。</div>`;
      return;
    }
    list.innerHTML = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(n => {
      const w = workOf(n.workId);
      return `<article class="item">
        <b>${w ? w.theme : "（作品不存在）"}</b> ${noteBadge(n)}
        <div class="meta">
          ${n.gallery} · ${n.start} ~ ${n.end}<br>
          售价 ${yuan(n.price)} · 佣金 ${n.commissionRate}%
          ${n.saleAmount != null ? `<br>成交额 ${yuan(n.saleAmount)}（${n.saleDate} 售出）` : ""}
          ${n.status === "已退回" ? `<br>退回损坏：${n.damage}（${n.returnDate}）` : ""}
        </div>
        <div class="actions">
          ${ConsignmentRules.canSell(n) ? `<button onclick="openSale('${n.id}')">售出</button>` : ""}
          ${ConsignmentRules.canReturn(n) ? `<button class="warn" onclick="openReturn('${n.id}')">退回</button>` : ""}
        </div>
      </article>`;
    }).join("");
  }

  function renderLedger() {
    const totals = Ledger.totals(ledger);
    $("#ledgerTotals").textContent = ledger.length
      ? `应收 ${yuan(totals["应收"])} · 待冲销 ${yuan(totals["待冲销"])} · 已冲销 ${yuan(totals["已冲销"])}`
      : "";
    const list = $("#ledgerList");
    if (!ledger.length) {
      list.innerHTML = `<div class="empty">暂无账目。寄卖售出后按成交额自动生成作者应收。</div>`;
      return;
    }
    list.innerHTML = [...ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(e => {
      const cls = e.state === "应收" ? "" : e.state === "待冲销" ? "amber" : "gray";
      return `<article class="item">
        <b>${e.type} ${yuan(e.amount)}</b> <span class="badge ${cls}">${e.state}</span>
        <div class="meta">
          ${e.workTheme} · ${e.gallery}<br>
          成交额 ${yuan(e.saleAmount)} · 佣金 ${e.commissionRate}%（${yuan(e.commissionAmount)}）<br>
          ${e.logs.join("<br>")}
        </div>
        ${e.state === "待冲销" ? `<div class="actions"><button class="warn" onclick="confirmWriteOff('${e.id}')">确认冲销</button></div>` : ""}
      </article>`;
    }).join("");
  }

  function renderConsignments() {
    renderNotes();
    renderLedger();
  }

  // 看板卡片上的寄卖中标记
  function consignMark(workId) {
    const n = ConsignmentRules.activeNoteFor(workId, notes, todayStr());
    return n ? `<br>寄卖中：${n.gallery}（至 ${n.end}）` : "";
  }

  /* ---------- 签订寄卖单 ---------- */

  function conflictHtml(verdict) {
    const c = verdict.conflict;
    return `无法签订：${verdict.reason}` + (c
      ? `<br>原单：${c.gallery} · ${c.start} ~ ${c.end} · 售价 ${yuan(c.price)} · 佣金 ${c.commissionRate}%`
      : "");
  }

  function openConsign(workId) {
    const work = workOf(workId);
    if (!work) return;
    consignWorkId = workId;
    $("#consignTitle").textContent = `签订寄卖单 · ${work.theme}（${work.base}）`;
    const verdict = ConsignmentRules.canConsign(work, notes, todayStr());
    const block = $("#consignBlock");
    if (verdict.ok) {
      block.hidden = true;
      $("#consignForm").hidden = false;
      $("#saveConsign").hidden = false;
      const form = $("#consignForm");
      form.reset();
      form.commissionRate.value = 20;
      form.start.value = todayStr();
      form.end.value = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    } else {
      // 状态不符或档期被占：指出原因和原单，不给填写、更不落账
      $("#consignForm").hidden = true;
      $("#saveConsign").hidden = true;
      block.hidden = false;
      block.innerHTML = conflictHtml(verdict);
    }
    $("#consignDialog").showModal();
  }

  function submitConsign(event) {
    event.preventDefault();
    const work = workOf(consignWorkId);
    if (!work) return;
    const form = $("#consignForm");
    const data = Object.fromEntries(new FormData(form).entries());
    const draft = {
      gallery: (data.gallery || "").trim(),
      start: data.start,
      end: data.end,
      price: Number(data.price),
      commissionRate: Number(data.commissionRate)
    };
    const block = $("#consignBlock");
    const check = ConsignmentRules.validateDraft(draft);
    if (!check.ok) {
      block.hidden = false;
      block.textContent = Object.values(check.errors).join("；");
      return;
    }
    // 保存前再判一次：档期被别的画廊占住就指出原单，保存不落账
    const verdict = ConsignmentRules.canConsign(work, notes, todayStr());
    if (!verdict.ok) {
      form.hidden = true;
      $("#saveConsign").hidden = true;
      block.hidden = false;
      block.innerHTML = conflictHtml(verdict);
      return;
    }
    const note = {
      id: crypto.randomUUID(),
      workId: work.id,
      ...draft,
      status: "进行中",
      saleAmount: null,
      saleDate: null,
      returnDate: null,
      damage: null,
      createdAt: new Date().toISOString(),
      logs: [`${stamp()} 签订寄卖单：${draft.gallery} ${draft.start} ~ ${draft.end}`]
    };
    notes.push(note);
    work.logs.push(`${stamp()} 签约寄卖：${draft.gallery} ${draft.start} ~ ${draft.end}，售价 ${yuan(draft.price)}，佣金 ${draft.commissionRate}%`);
    persist();
    save();
    $("#consignDialog").close();
    render();
  }

  /* ---------- 售出 ---------- */

  function openSale(noteId) {
    const note = noteOf(noteId);
    if (!ConsignmentRules.canSell(note)) return;
    saleNoteId = noteId;
    $("#saleInfo").innerHTML = `${note.gallery} · 售价 ${yuan(note.price)} · 佣金 ${note.commissionRate}%`;
    $("#saleAmount").value = note.price;
    updateSalePreview();
    $("#saleDialog").showModal();
  }

  function updateSalePreview() {
    const note = noteOf(saleNoteId);
    if (!note) return;
    const amount = Number($("#saleAmount").value);
    const preview = $("#salePreview");
    if (!(amount > 0)) {
      preview.textContent = "请填写大于 0 的成交额";
      return;
    }
    const receivable = Ledger.receivableAmount(amount, note.commissionRate);
    preview.textContent = `作者应收 ${yuan(receivable)}（成交额 ${yuan(amount)} − 佣金 ${yuan(amount - receivable)}）`;
  }

  function confirmSale() {
    const note = noteOf(saleNoteId);
    if (!ConsignmentRules.canSell(note)) return;
    const amount = Number($("#saleAmount").value);
    if (!(amount > 0)) {
      updateSalePreview();
      return;
    }
    const work = workOf(note.workId);
    if (!work) return;
    const time = stamp();
    note.status = "已售出";
    note.saleAmount = amount;
    note.saleDate = todayStr();
    note.logs.push(`${time} 售出，成交额 ${yuan(amount)}`);
    const entry = Ledger.postSale({ note, work, saleAmount: amount, now: time });
    ledger.push(entry);
    work.status = "已售出";
    work.logs.push(`${time} 寄卖售出：成交额 ${yuan(amount)}，作者应收 ${yuan(entry.amount)}`);
    persist();
    save();
    $("#saleDialog").close();
    render();
  }

  /* ---------- 售后退回 ---------- */

  function openReturn(noteId) {
    const note = noteOf(noteId);
    if (!ConsignmentRules.canReturn(note)) return;
    returnNoteId = noteId;
    $("#returnInfo").innerHTML = `${note.gallery} · 成交额 ${yuan(note.saleAmount)}<br>确认后作品转入返修，原作者应收转为待冲销。`;
    $("#damageInput").value = "";
    $("#returnError").hidden = true;
    $("#returnDialog").showModal();
  }

  function confirmReturn() {
    const note = noteOf(returnNoteId);
    if (!ConsignmentRules.canReturn(note)) return;
    const damage = $("#damageInput").value.trim();
    if (!damage) {
      $("#returnError").hidden = false;
      $("#damageInput").focus();
      return;
    }
    const work = workOf(note.workId);
    const time = stamp();
    note.status = "已退回";
    note.returnDate = todayStr();
    note.damage = damage;
    note.logs.push(`${time} 售后退回：${damage}`);
    if (work) {
      work.defect = work.defect ? `${work.defect}; 退回损坏：${damage}` : `退回损坏：${damage}`;
      work.status = "返修";
      work.logs.push(`${time} 售后退回：${damage}，转入返修`);
    }
    const entry = ledger.find(e => e.noteId === note.id && e.state === "应收");
    Ledger.markPendingWriteOff(entry, time);
    persist();
    save();
    $("#returnDialog").close();
    render();
  }

  /* ---------- 冲销与账本导出 ---------- */

  function confirmWriteOff(entryId) {
    const entry = ledger.find(e => e.id === entryId);
    if (Ledger.writeOff(entry, stamp())) {
      persist();
      render();
    }
  }

  function exportLedger() {
    const payload = { 导出时间: stamp(), 寄卖单: notes, 账本: ledger, 合计: Ledger.totals(ledger) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "consignment-ledger.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /* ---------- 事件 ---------- */

  $("#consignForm").addEventListener("submit", submitConsign);
  $("#closeConsign").addEventListener("click", () => $("#consignDialog").close());
  $("#saleAmount").addEventListener("input", updateSalePreview);
  $("#confirmSale").addEventListener("click", confirmSale);
  $("#cancelSale").addEventListener("click", () => $("#saleDialog").close());
  $("#confirmReturn").addEventListener("click", confirmReturn);
  $("#cancelReturn").addEventListener("click", () => $("#returnDialog").close());
  $("#exportLedgerBtn").addEventListener("click", exportLedger);

  window.renderConsignments = renderConsignments;
  window.consignMark = consignMark;
  window.openConsign = openConsign;
  window.openSale = openSale;
  window.openReturn = openReturn;
  window.confirmWriteOff = confirmWriteOff;
})();
