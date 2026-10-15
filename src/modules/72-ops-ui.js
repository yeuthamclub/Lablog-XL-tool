/* ---------- Vận hành máy: giao diện ---------- */

const OPS_SUBS = [['tat', 'Thời gian trả kết quả'], ['err', 'Huỷ & lỗi'], ['maint', 'Bảo trì & kiểm tra'], ['state', 'Nhiệt độ & trạng thái'], ['reag', 'Thuốc thử & vật tư'], ['dil', 'Pha loãng'], ['lis', 'LIS'], ['user', 'Người dùng'], ['journey', 'Hành trình mẫu']];
const sidBtn = sid => `<button type="button" class="linkbtn mono" data-journey="${esc(sid)}">${esc(sid)}</button>`;
const kpi = (l, v, s, warn) => `<div class="kpi"><div class="l">${l}</div><div class="v"${warn ? ' style="color:var(--warn)"' : ''}>${v}</div><div class="s">${s || ''}</div></div>`;
const pct = (a, b) => b ? fmt(a / b * 100, 1) + '%' : '–';

function renderOps() {
  const el = document.getElementById('p-ops'); if (!el) return;
  const M = S.M || emptyM(), has = M.has || {};
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  const dl = days(S.D);
  if (!has.log && !has.lis && !has.dil) {
    el.innerHTML = `<div class="card"><div class="hd"><h2>Chưa có nhật ký vận hành</h2></div>
      <p>Tab này cần dữ liệu ngoài FinishedJobs: hãy nạp nguyên file sao lưu <b>.zip</b> của máy (vd <code>2210005303_temp_archive_2026_09.zip</code>) và file <code>…_temp_archiveLisLas_….zip</code> nếu có. Công cụ sẽ đọc LogFile, DilutionLog và vết LIS bên trong để phân tích thời gian trả kết quả, huỷ test, bảo trì, nhiệt độ, thuốc thử và LIS.</p>
      <p class="note">Với dữ liệu hiện có vẫn xem được: số test pha loãng (cột Dilution Factor) ở mục Pha loãng bên dưới.</p></div>` + `<div class="card">${opsDil()}</div>`;
    bindOps(el); return;
  }
  const subs = OPS_SUBS.filter(([k]) => k !== 'lis' || has.lis);
  if (!subs.some(s => s[0] === OPS.sub)) OPS.sub = 'tat';
  const body = { tat: opsTAT, err: opsErr, maint: opsMaint, state: opsState, reag: opsReag, dil: opsDil, lis: opsLIS, user: opsUser, journey: opsJourney }[OPS.sub]();
  el.innerHTML = `<div class="filters">
      <label>Xét nghiệm<select id="opsAssay">${opt('', 'Tất cả', OPS.assay)}${assays().map(a => opt(a, a, OPS.assay)).join('')}</select></label>
      <label>Từ ngày<input type="date" id="opsFrom" value="${esc(OPS.from)}" min="${dl[0] || ''}" max="${dl.at(-1) || ''}"></label>
      <label>Đến ngày<input type="date" id="opsTo" value="${esc(OPS.to)}" min="${dl[0] || ''}" max="${dl.at(-1) || ''}"></label>
      <label>Mục tiêu TAT (phút)<input type="number" id="opsTarget" min="5" max="1440" step="5" value="${OPS.target}"></label>
    </div>
    <div class="seg" role="tablist" aria-label="Mục vận hành" style="margin:4px 0 12px">${subs.map(([k, l]) => `<button type="button" class="btn sm${OPS.sub === k ? ' on' : ''}" data-opsub="${k}" role="tab" aria-selected="${OPS.sub === k}">${l}</button>`).join('')}</div>
    ${!has.log ? '<div class="note">Chưa có LogFile: các mục dựa trên nhật ký máy (nạp ống, huỷ, bảo trì, nhiệt độ) sẽ trống. Nạp file sao lưu .zip của máy để xem đủ.</div>' : ''}
    ${body}`;
  bindOps(el);
}

function bindOps(el) {
  const on = (id, ev, f) => { const x = el.querySelector(id); if (x) x.addEventListener(ev, f); };
  on('#opsAssay', 'change', e => { OPS.assay = e.target.value; renderOps(); });
  on('#opsFrom', 'change', e => { OPS.from = e.target.value; renderOps(); });
  on('#opsTo', 'change', e => { OPS.to = e.target.value; renderOps(); });
  on('#opsTarget', 'change', e => { const v = +e.target.value; if (v > 0) { OPS.target = v; saveOPS(); OPS.cache = null; renderOps(); } });
  on('#jrForm', 'submit', e => { e.preventDefault(); OPS.sid = el.querySelector('#jrSid').value.trim(); renderOps(); });
  el.querySelectorAll('[data-opsub]').forEach(b => b.onclick = () => { OPS.sub = b.dataset.opsub; renderOps(); });
}
// Bấm Sample ID ở bất kỳ đâu trong tab → xem hành trình mẫu
document.addEventListener('click', e => {
  const b = e.target.closest('[data-journey]'); if (b) { OPS.sid = b.dataset.journey; OPS.sub = 'journey'; gotoTab('ops'); renderOps(); window.scrollTo({ top: document.getElementById('p-ops').offsetTop - 60, behavior: 'smooth' }); return; }
  const v = e.target.closest('[data-evt]'); if (v) showEventsAround(+v.dataset.evt, v.dataset.evtTitle || '', v.dataset.evtAssay || '');
});
function gotoTab(k) { const t = document.querySelector(`.tab[data-tab="${k}"]`); if (t) t.click(); }

/* ---- 1. TAT ---- */
function opsTAT() {
  const { jobs } = opsJobs(), J = opsFilter(jobs), T = OPS.target;
  if (!S.M.has.log) return '<div class="empty">Cần LogFile (thời điểm nạp ống) để tính thời gian trả kết quả.</div>';
  const withT = J.filter(j => Number.isFinite(j.tat) && j.tat >= 0 && j.tat < 24 * 60);
  const over = withT.filter(j => j.tat > T);
  const byA = [...groupBy(withT, j => j.assay)].sort((a, b) => b[1].length - a[1].length);
  const rows = byA.map(([a, L]) => { const ov = L.filter(j => j.tat > T).length, mt = medOf(L.map(j => j.tat));
    return `<tr><td>${esc(a)}</td><td class="num">${L.length}</td><td class="num"><b>${minFmt(mt)}</b></td><td class="num">${minFmt(qOf(L.map(j => j.tat), .9))}</td><td class="num">${ov ? `<span class="pill ${ov / L.length > .1 ? 'p-crit' : 'p-high'}">${pct(ov, L.length)}</span>` : '0%'}</td>
      <td class="num">${minFmt(medOf(L.map(j => j.wait)))}</td><td class="num">${minFmt(medOf(L.map(j => j.run)))}</td><td class="num">${minFmt(medOf(L.map(j => j.lisSend)))}</td><td class="num">${L.filter(j => j.isRerun).length || ''}</td></tr>`; }).join('');
  // theo giờ nạp ống, theo thứ
  const hours = [...Array(24).keys()], hIn = hours.map(h => withT.filter(j => j.hour === h && j.tat <= T).length), hOv = hours.map(h => withT.filter(j => j.hour === h && j.tat > T).length);
  const hk = hours.filter((h, i) => hIn[i] + hOv[i]);
  const hMed = hk.map(h => medOf(withT.filter(j => j.hour === h).map(j => j.tat)));
  const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'], wOrder = [1, 2, 3, 4, 5, 6, 0];
  const wk = wOrder.filter(w => withT.some(j => j.wd === w));
  // theo ngày, có mốc sự kiện
  const byDay = [...groupBy(withT, j => j.day)].sort();
  const pts = byDay.map(([d, L]) => ({ t: +new Date(d + 'T12:00:00'), v: medOf(L.map(j => j.tat)), bad: L.filter(j => j.tat > T).length / L.length > .1, r: Math.min(6, 2 + Math.sqrt(L.length) / 4), title: `${d}: trung vị ${minFmt(medOf(L.map(j => j.tat)))} · p90 ${minFmt(qOf(L.map(j => j.tat), .9))} · ${L.length} test · ${L.filter(j => j.tat > T).length} quá ${T} ph` }));
  const p90 = byDay.map(([d, L]) => ({ t: +new Date(d + 'T12:00:00'), v: qOf(L.map(j => j.tat), .9) }));
  const t0 = pts.length ? pts[0].t - 432e5 : 0, t1 = pts.length ? pts.at(-1).t + 432e5 : 0;
  const ev = pts.length ? machEvents(t0, t1, { assay: OPS.assay, types: ['maint', 'temp', 'lot', 'cal'] }).filter(e => e.type !== 'maint' || e.bad || /Månad|Month|Week|Vecko/i.test(e.txt)) : [];
  // mẫu chậm
  const slow = over.slice().sort((a, b) => b.tat - a.tat).slice(0, 300);
  const rc = {}; for (const j of over) { const ks = j.reasons.length ? [...new Set(j.reasons.map(r => r.k))] : ['none']; for (const k of ks) rc[k] = (rc[k] || 0) + 1; }
  const RK = { rerun: 'Chạy lại', abort: 'Huỷ / hút lỗi', dil: 'Pha loãng', lis: 'LIS chậm / không phản hồi', wait: 'Chờ hút lâu', halt: 'Máy dừng / bảo trì', temp: 'Báo nhiệt độ', none: 'Chưa rõ (thường do tải mẫu đông)' };
  const slowRows = slow.map(j => `<tr><td class="mono">${tStr(j.t0).slice(5)}</td><td>${sidBtn(j.sid)}</td><td>${esc(j.assay)}</td><td class="num"><b>${minFmt(j.tat)}</b></td><td class="num">${minFmt(j.wait)}</td><td class="num">${minFmt(j.run)}</td><td>${j.reasons.map(r => `<span class="pill ${r.k === 'abort' || r.k === 'halt' ? 'p-crit' : 'p-high'}">${esc(r.t)}</span>`).join('') || '<span class="cat">–</span>'}</td></tr>`).join('');
  const nP = J.length;
  return `<div class="kpis">
    ${kpi('Test BN tính được TAT', fmt(withT.length, 0), `${pct(withT.length, nP)} trong ${fmt(nP, 0)} test BN (có thời điểm nạp ống)`)}
    ${kpi('TAT trung vị', minFmt(medOf(withT.map(j => j.tat))), `từ lúc nạp ống tới khi có kết quả`)}
    ${kpi('TAT p90', minFmt(qOf(withT.map(j => j.tat), .9)), `90% test xong trong thời gian này`)}
    ${kpi(`Quá ${T} phút`, pct(over.length, withT.length), `${over.length} test`, over.length / Math.max(1, withT.length) > .1)}
    ${kpi('Chờ hút mẫu (trung vị)', minFmt(medOf(withT.map(j => j.wait))), 'nạp ống → máy hút mẫu')}
    ${kpi('Gửi LIS (trung vị)', minFmt(medOf(withT.map(j => j.lisSend))), S.M.has.lis ? 'có kết quả → gửi sang LIS' : 'cần file LisLas')}
  </div>
  <div class="card"><div class="hd"><h2>TAT theo xét nghiệm</h2><span class="sub">TAT = thời điểm có kết quả − lần nạp ống đầu tiên (test chạy lại tính từ lần nạp đầu). Ủ & đo = máy hút mẫu → có kết quả, gần như cố định theo quy trình xét nghiệm.</span></div>
    <div class="scroll"><table><thead><tr><th>Xét nghiệm</th><th class="num">n</th><th class="num">Trung vị</th><th class="num">p90</th><th class="num">Quá ${T} ph</th><th class="num">Chờ hút</th><th class="num">Ủ & đo</th><th class="num">Gửi LIS</th><th class="num">Chạy lại</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="empty">Không có dữ liệu</td></tr>'}</tbody></table></div></div>
  <div class="card"><div class="hd"><h2>TAT trung vị theo ngày</h2><span class="sub">Chấm đỏ: ngày có > 10% test quá ${T} phút. Vạch dọc: sự kiện máy.</span></div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Trung vị</span><span><i style="background:var(--c2)"></i>p90</span></div>${evtLegend(ev)}
    <div class="scroll">${tsChart([{ name: 'p90', color: 'var(--c2)', pts: p90 }, { name: 'Trung vị', color: 'var(--accent)', pts }], { events: ev, hlines: [{ v: T, label: `Mục tiêu ${T} ph` }], yfmt: v => fmt(v, 0), zero: true, label: 'TAT theo ngày' })}</div></div>
  <div class="grid2">
    <div class="card"><div class="hd"><h2>Theo giờ nạp ống</h2></div><div class="legend"><span><i style="background:var(--accent)"></i>≤ ${T} ph</span><span><i style="background:var(--warn)"></i>> ${T} ph</span></div>
      <div class="scroll">${stackedBars(hk.map(h => p2(h) + 'h'), [{ name: `≤ ${T} ph`, color: 'var(--accent)', values: hk.map(h => hIn[h]) }, { name: `> ${T} ph`, color: 'var(--warn)', values: hk.map(h => hOv[h]) }])}</div>
      <div class="note">TAT trung vị theo giờ: ${hk.map((h, i) => `${p2(h)}h ${minFmt(hMed[i])}`).join(' · ')}</div></div>
    <div class="card"><div class="hd"><h2>Theo thứ trong tuần</h2></div>
      <div class="scroll">${stackedBars(wk.map(w => WD[w]), [{ name: `≤ ${T} ph`, color: 'var(--accent)', values: wk.map(w => withT.filter(j => j.wd === w && j.tat <= T).length) }, { name: `> ${T} ph`, color: 'var(--warn)', values: wk.map(w => withT.filter(j => j.wd === w && j.tat > T).length) }])}</div>
      <div class="note">TAT trung vị: ${wk.map(w => `${WD[w]} ${minFmt(medOf(withT.filter(j => j.wd === w).map(j => j.tat)))}`).join(' · ')}</div></div>
  </div>
  <div class="card"><div class="hd"><h2>Test quá ${T} phút và nguyên nhân có thể</h2><span class="sub">${over.length} test · bấm Sample ID để xem hành trình mẫu</span></div>
    <div class="legend" style="gap:14px">${Object.entries(rc).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span><b class="mono">${n}</b> ${RK[k]}</span>`).join('')}</div>
    ${slowRows ? `<div class="tablebox" style="max-height:460px"><table><thead><tr><th>Nạp ống</th><th>Mã mẫu</th><th>XN</th><th class="num">TAT</th><th class="num">Chờ hút</th><th class="num">Ủ & đo</th><th>Nguyên nhân có thể</th></tr></thead><tbody>${slowRows}</tbody></table></div>${over.length > 300 ? '<div class="note">Hiện 300 test chậm nhất.</div>' : ''}` : '<div class="empty">Không có test nào vượt mục tiêu.</div>'}
    <div class="note">Nguyên nhân được suy ra bằng cách đối chiếu nhật ký máy cùng Sample ID và khoảng thời gian; cần xác nhận lại với quy trình thực tế (vd ống nạp sớm nhưng chờ ly tâm, ưu tiên mẫu khác).</div></div>`;
}

/* ---- 2. Huỷ & lỗi ---- */
function opsErr() {
  const M = S.M, A = OPS.assay;
  const ab = opsArr(M.aborts).filter(e => !A || e.assay === A), fl = opsArr(M.fails).filter(e => !A || e.assay === A);
  const catOf = sid => sid.startsWith('$') ? 'Chuẩn' : sid.startsWith('#') ? 'QC' : 'BN';
  const cats = ['Mẫu', 'Thuốc thử', 'Cơ khí', 'Khác'];
  const reasons = [...groupBy(ab, e => e.reason)].sort((a, b) => b[1].length - a[1].length);
  const asy = [...new Set(ab.map(e => e.assay))].sort();
  const mtx = reasons.map(([r, L]) => `<tr><td>${esc(viReason(r))} <span class="cat">${esc(r)}</span></td><td><span class="pill" style="background:var(--sunk);color:${ABORT_CAT_COLOR[abortCat(r)]}">${abortCat(r)}</span></td><td class="num"><b>${L.length}</b></td>${asy.map(a => { const n = L.filter(e => e.assay === a).length; return `<td class="num">${n || ''}</td>`; }).join('')}</tr>`).join('');
  const dl = [...new Set(ab.map(e => dStr(e.t)))].sort();
  const reruns = opsFilter(opsJobs().jobs).filter(j => j.isRerun);
  const halted = opsArr(M.states).filter(e => e.to === 'Halted');
  const list = ab.slice().reverse().map(e => `<tr><td class="mono">${sStr(e.t).slice(5)}</td><td>${catOf(e.sid) === 'BN' ? sidBtn(e.sid) : `<span class="mono">${esc(e.sid)}</span>`}</td><td class="cat">${catOf(e.sid)}</td><td>${esc(e.assay)}</td><td>${esc(viReason(e.reason))}</td><td><button class="btn sm" type="button" data-evt="${e.t}" data-evt-assay="${esc(e.assay)}" data-evt-title="Huỷ ${esc(e.assay)} mẫu ${esc(e.sid)}: ${esc(viReason(e.reason))}">Sự kiện ±24h</button></td></tr>`).join('');
  const pat = opsFilter(opsJobs().jobs).length;
  return `<div class="kpis">
    ${kpi('Test bị huỷ', ab.length, `${ab.filter(e => catOf(e.sid) === 'BN').length} BN · ${ab.filter(e => catOf(e.sid) !== 'BN').length} QC/chuẩn`, ab.length > 0)}
    ${cats.map(c => kpi('Do ' + c.toLowerCase(), ab.filter(e => abortCat(e.reason) === c).length, '')).join('')}
    ${kpi('Hút lỗi', fl.length, [...groupBy(fl, e => viReason(e.reason))].map(([k, L]) => `${L.length} ${k.toLowerCase()}`).join(' · '))}
    ${kpi('Test BN chạy lại', reruns.length, pat ? pct(reruns.length, pat) + ' số test BN' : '')}
    ${kpi('Lần máy dừng (Halted)', halted.length, 'theo nhật ký trạng thái')}
  </div>
  <div class="card"><div class="hd"><h2>Huỷ theo lý do và xét nghiệm</h2></div>
    ${mtx ? `<div class="scroll"><table><thead><tr><th>Lý do</th><th>Nhóm</th><th class="num">Tổng</th>${asy.map(a => `<th class="num">${esc(a)}</th>`).join('')}</tr></thead><tbody>${mtx}</tbody></table></div>` : '<div class="empty">Không có test bị huỷ.</div>'}
    <div class="note">Cục đông / không có mẫu thường do chất lượng mẫu (ly tâm, thể tích); hết thuốc thử, Starter, lỗi Integral do quản lý thuốc thử; lỗi cơ khí cần theo dõi nếu lặp lại.</div></div>
  ${dl.length ? `<div class="card"><div class="hd"><h2>Huỷ theo ngày</h2></div><div class="legend">${cats.map(c => `<span><i style="background:${ABORT_CAT_COLOR[c]}"></i>${c}</span>`).join('')}</div>
    <div class="scroll">${stackedBars(dl.map(d => d.slice(8) + '/' + d.slice(5, 7)), cats.map(c => ({ name: c, color: ABORT_CAT_COLOR[c], values: dl.map(d => ab.filter(e => dStr(e.t) === d && abortCat(e.reason) === c).length) })))}</div></div>` : ''}
  <div class="card"><div class="hd"><h2>Danh sách test bị huỷ</h2><span class="sub">“Sự kiện ±24h” mở các sự kiện máy quanh thời điểm đó</span></div>
    ${list ? `<div class="tablebox" style="max-height:420px"><table><thead><tr><th>Thời điểm</th><th>Mã mẫu</th><th>Loại</th><th>XN</th><th>Lý do</th><th></th></tr></thead><tbody>${list}</tbody></table></div>` : '<div class="empty">Không có.</div>'}</div>`;
}

/* ---- 3. Bảo trì & kiểm tra quang học ---- */
function maintCalendar(M, dlist) {
  const tasks = [...new Set(M.maint.filter(e => !e.step).map(e => e.task))].sort((a, b) => ['day', 'week', 'month', 'other'].indexOf(maintFreq(a)) - ['day', 'week', 'month', 'other'].indexOf(maintFreq(b)));
  if (!tasks.length || !dlist.length) return '';
  const cell = (task, d) => {
    const L = M.maint.filter(e => e.task === task && dStr(e.t) === d && (!e.step || e.st === 'fail'));
    if (!L.length) return '<td></td>';
    const ok = L.some(e => !e.step && e.st === 'ok'), fail = L.some(e => e.st === 'fail');
    const tip = L.map(e => `${tStr(e.t).slice(11)} ${e.step ? 'bước ' + e.step + ' ' : ''}${e.st === 'ok' ? 'hoàn tất' : e.st === 'fail' ? 'lỗi' : 'huỷ'}`).join('; ');
    return `<td class="num" title="${esc(tip)}" style="background:${ok && !fail ? 'var(--accent-soft)' : ok ? 'var(--warn-soft)' : fail ? 'var(--crit-soft)' : 'var(--sunk)'};color:${ok && !fail ? 'var(--accent)' : fail ? 'var(--crit)' : 'var(--muted)'}">${ok ? '✓' : fail ? '✗' : '–'}</td>`;
  };
  const testDays = new Set(S.D.filter(r => r.cat !== 'clean').map(r => r.day));
  return `<div class="scroll"><table class="cal"><thead><tr><th>Quy trình</th>${dlist.map(d => `<th class="num" style="padding:4px 3px;${new Date(d + 'T00:00:00').getDay() === 0 ? 'color:var(--crit)' : ''}">${d.slice(8)}</th>`).join('')}</tr></thead>
    <tbody>${tasks.map(t => `<tr><td style="white-space:nowrap">${maintVi(t)}</td>${dlist.map(d => cell(t, d)).join('')}</tr>`).join('')}
    <tr><td class="cat">Ngày có chạy mẫu</td>${dlist.map(d => `<td class="num cat">${testDays.has(d) ? '•' : ''}</td>`).join('')}</tr></tbody></table></div>
    <div class="legend"><span><i style="background:var(--accent-soft)"></i>✓ hoàn tất</span><span><i style="background:var(--warn-soft)"></i>hoàn tất sau khi có bước lỗi</span><span><i style="background:var(--crit-soft)"></i>✗ lỗi, chưa hoàn tất</span><span><i style="background:var(--sunk)"></i>– huỷ</span></div>`;
}
function maintCompliance(M) {
  const tests = [...new Set(S.D.filter(r => r.cat !== 'clean').map(r => r.day))].sort(); if (!tests.length) return [];
  const done = f => M.maint.filter(e => !e.step && e.st === 'ok' && maintFreq(e.task) === f).map(e => dStr(e.t));
  const dayDone = new Set(done('day'));
  const wk = d => { const x = new Date(d + 'T12:00:00'); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return dStr(+x); };
  const weekDone = new Set(done('week').map(wk)), monthDone = new Set(done('month').map(d => d.slice(0, 7)));
  return [
    { f: 'Hằng ngày', miss: tests.filter(d => !dayDone.has(d)), unit: 'ngày', tot: tests.length },
    { f: 'Hằng tuần', miss: [...new Set(tests.map(wk))].filter(w => !weekDone.has(w)), unit: 'tuần', tot: new Set(tests.map(wk)).size },
    { f: 'Hằng tháng', miss: [...new Set(tests.map(d => d.slice(0, 7)))].filter(m => !monthDone.has(m)), unit: 'tháng', tot: new Set(tests.map(d => d.slice(0, 7))).size }
  ];
}
function chkChart(M, kinds) {
  const C = { BGW: 'var(--c2)', 'LC trái': 'var(--c3)', 'LC phải': 'var(--c7)' };
  const series = kinds.map(k => ({ name: k, color: C[k], pts: opsArr(M.chk).filter(c => c.kind === k).map(c => ({ t: c.t, v: c.mean, bad: !c.ok || c.cv > (k === 'BGW' ? 15 : 3), title: `${tStr(c.t)} ${k}: ${c.ok ? 'đạt' : 'KHÔNG ĐẠT'} · TB ${fmt(c.mean, 0)} RLU · CV ${fmt(c.cv, 1)}%` })) })).filter(s => s.pts.length);
  if (!series.length) return '';
  return `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name} (${s.pts.length})</span>`).join('')}</div><div class="scroll">${tsChart(series, { yfmt: v => fmt(v, 0), label: 'RLU kiểm tra quang học' })}</div>`;
}
function maintLogHTML() {
  const M = S.M; if (!M || !M.has || !M.has.log) return '';
  const dlist = (() => { const ds = [...new Set(M.maint.map(e => dStr(e.t)).concat(S.D.map(r => r.day)))].filter(opsInRange).sort(); if (!ds.length) return []; const out = []; for (let t = +new Date(ds[0] + 'T12:00:00'); dStr(t) <= ds.at(-1); t += 864e5) out.push(dStr(t)); return out.slice(-62); })();
  const comp = maintCompliance(M);
  const chk = opsArr(M.chk), fails = opsArr(M.maint).filter(e => e.st === 'fail');
  const stat = k => { const L = chk.filter(c => c.kind === k); if (!L.length) return ''; const mv = L.map(c => c.mean), cv = L.map(c => c.cv);
    return `<tr><td>${k}</td><td class="num">${L.length}</td><td class="num">${L.filter(c => !c.ok).length ? `<span class="pill p-crit">${L.filter(c => !c.ok).length}</span>` : '0'}</td><td class="num">${fmt(mean(mv), 0)}</td><td class="num">${fmt(sd(mv) / mean(mv) * 100, 1)}%</td><td class="num">${fmt(medOf(cv), 1)}% <span class="cat">(max ${fmt(Math.max(...cv), 1)}%)</span></td><td class="mono">${tStr(L.at(-1).t)}</td><td class="num">${fmt(L.at(-1).mean, 0)}</td></tr>`; };
  return `<div class="hd" style="margin-top:8px"><h2>Bảo trì theo nhật ký máy (LogFile)</h2><span class="sub">Quy trình bảo trì do máy ghi lại, kết quả BGW và Light Check</span></div>
  <div class="kpis">${comp.map(c => kpi(`Thiếu bảo trì ${c.f.toLowerCase()}`, c.miss.length, `${c.miss.length}/${c.tot} ${c.unit} có chạy mẫu${c.miss.length && c.unit === 'ngày' ? ': ' + c.miss.slice(0, 4).map(d => d.slice(5)).join(', ') + (c.miss.length > 4 ? '…' : '') : ''}`, c.miss.length > 0)).join('')}
    ${kpi('Bước bảo trì lỗi', fails.length, fails.length ? fails.slice(-2).map(e => `${tStr(e.t).slice(5)} ${e.stepName}`).join('; ') : '')}
    ${kpi('BGW / Light Check không đạt', chk.filter(c => !c.ok).length, `${chk.length} lần kiểm tra`)}</div>
  <div class="card"><div class="hd"><h2>Lịch bảo trì</h2><span class="sub">${dlist.length > 61 ? '62 ngày gần nhất' : ''} Rê chuột lên ô để xem giờ</span></div>${maintCalendar(M, dlist) || '<div class="empty">Không có bản ghi bảo trì.</div>'}
    <div class="note">Phân loại theo tên quy trình (BGW/Light Check/Background = hằng ngày; Weekly/Veckounderhåll = tuần; Monthly/Månadsunderhåll = tháng). Lịch bắt buộc theo quy trình của phòng và hướng dẫn của hãng.</div></div>
  <div class="grid2">
    <div class="card"><div class="hd"><h2>Đo nền BGW</h2><span class="sub">RLU trung bình mỗi lần; chấm đỏ: không đạt hoặc CV > 15%</span></div>${chkChart(M, ['BGW']) || '<div class="empty">Không có.</div>'}</div>
    <div class="card"><div class="hd"><h2>Light Check tay hút trái / phải</h2><span class="sub">chấm đỏ: không đạt hoặc CV > 3%</span></div>${chkChart(M, ['LC trái', 'LC phải']) || '<div class="empty">Không có.</div>'}</div>
  </div>
  <div class="card"><div class="hd"><h2>Thống kê kiểm tra quang học</h2></div><div class="scroll"><table><thead><tr><th>Kiểm tra</th><th class="num">Số lần</th><th class="num">Không đạt</th><th class="num">RLU TB</th><th class="num">CV giữa các lần</th><th class="num">CV trong lần (trung vị)</th><th>Lần cuối</th><th class="num">RLU lần cuối</th></tr></thead><tbody>${['BGW', 'LC trái', 'LC phải'].map(stat).join('')}</tbody></table></div>
    ${fails.length ? `<div class="scroll"><table><thead><tr><th>Thời điểm</th><th>Quy trình</th><th>Bước lỗi</th></tr></thead><tbody>${fails.map(e => `<tr><td class="mono">${tStr(e.t)}</td><td>${maintVi(e.task)}</td><td>${e.step ? e.step + ': ' + esc(e.stepName) : 'Cả quy trình kết thúc lỗi'}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
}
function opsMaint() { return maintLogHTML() || '<div class="empty">Cần LogFile để xem bảo trì theo nhật ký máy. Bảo trì theo lần chạy CLEAN xem ở tab “Bảo trì (CLEAN)”.</div>'; }

/* ---- 4. Nhiệt độ & trạng thái máy ---- */
function opsState() {
  const M = S.M; if (!M.has.log) return '<div class="empty">Cần LogFile.</div>';
  const eps = tempEpisodes().filter(e => opsInRange(e.t0)), real = eps.filter(e => !e.startup);
  const parts = [...groupBy(eps, e => e.part)];
  const pRows = parts.map(([p, L]) => { const R = L.filter(e => !e.startup), d = R.map(e => e.dur).filter(Number.isFinite);
    return `<tr><td>${esc(p)}</td><td class="num">${L.length}</td><td class="num">${L.length - R.length}</td><td class="num"><b>${R.length}</b></td><td class="num">${d.length ? minFmt(d.reduce((a, b) => a + b, 0)) : '–'}</td><td class="num">${d.length ? minFmt(Math.max(...d)) : '–'}</td><td class="num">${fmt(Math.min(...L.map(e => e.vmin)), 1)} – ${fmt(Math.max(...L.map(e => e.vmax)), 1)} °C</td></tr>`; }).join('');
  const affected = real.map(e => { const n = S.D.filter(r => r.cat === 'patient' && +r.time >= e.t0 && +r.time <= (Number.isFinite(e.t1) ? e.t1 : e.t0) && (!OPS.assay || r.assay === OPS.assay)).length; return { ...e, n }; });
  const eRows = affected.slice().reverse().map(e => `<tr><td class="mono">${tStr(e.t0)}</td><td>${esc(e.part)}</td><td class="num">${minFmt(e.dur)}</td><td class="num">${fmt(e.vmin, 1)}${e.vmax !== e.vmin ? ' – ' + fmt(e.vmax, 1) : ''} °C</td><td class="num">${e.n ? `<span class="pill p-high">${e.n}</span>` : '0'}</td><td><button class="btn sm" type="button" data-evt="${e.t0}" data-evt-title="${esc(e.part)} ngoài khoảng">Sự kiện ±24h</button></td></tr>`).join('');
  const H = stateHours(), dl = Object.keys(H).filter(opsInRange).sort(), G = ['run', 'ready', 'maint', 'standby', 'down'];
  const tot = G.map(g => dl.reduce((a, d) => a + H[d][g], 0)), all = tot.reduce((a, b) => a + b, 0);
  const halts = opsArr(M.states).filter(e => e.to === 'Halted' && !/Not Initialized|Initializing/.test(e.from));
  return `<div class="kpis">
    ${kpi('Lần nhiệt độ ngoài khoảng', real.length, `${eps.length - real.length} lần khác xảy ra lúc khởi động máy (bình thường)`, real.length > 0)}
    ${kpi('Kết quả BN trong lúc ngoài khoảng', affected.reduce((a, e) => a + e.n, 0), 'nên xem lại nếu ngoài khoảng kéo dài')}
    ${G.map((g, i) => kpi(STATE_LABEL[g], fmt(tot[i], 0) + ' giờ', all ? pct(tot[i], all) + ' thời gian có log' : '')).join('')}
    ${kpi('Lần chuyển Halted', halts.length, 'khi đang hoạt động (không tính lúc khởi động)')}
  </div>
  <div class="card"><div class="hd"><h2>Nhiệt độ ngoài khoảng theo bộ phận</h2></div>
    ${pRows ? `<div class="scroll"><table><thead><tr><th>Bộ phận</th><th class="num">Tổng</th><th class="num">Lúc khởi động</th><th class="num">Khi đang hoạt động</th><th class="num">Tổng thời gian</th><th class="num">Dài nhất</th><th class="num">Nhiệt độ ghi nhận</th></tr></thead><tbody>${pRows}</tbody></table></div>` : '<div class="empty">Không có lần nào.</div>'}
    ${eRows ? `<div class="tablebox" style="max-height:360px"><table><thead><tr><th>Bắt đầu</th><th>Bộ phận</th><th class="num">Kéo dài</th><th class="num">Nhiệt độ</th><th class="num">KQ BN trong lúc đó</th><th></th></tr></thead><tbody>${eRows}</tbody></table></div>` : ''}
    <div class="note">“Lúc khởi động”: trong 45 phút sau khi máy khởi động/tiếp tục — bộ gia nhiệt chưa đạt nhiệt độ, máy chưa chạy mẫu. Khoảng còn mở (chưa thấy dòng “now in range”) có thời gian “–”.</div></div>
  ${dl.length ? `<div class="card"><div class="hd"><h2>Thời gian theo trạng thái máy mỗi ngày (giờ)</h2></div><div class="legend">${G.map(g => `<span><i style="background:${STATE_COLOR[g]}"></i>${STATE_LABEL[g]}</span>`).join('')}</div>
    <div class="scroll">${stackedBars(dl.map(d => d.slice(8) + '/' + d.slice(5, 7)), G.map(g => ({ name: STATE_LABEL[g], color: STATE_COLOR[g], values: dl.map(d => Math.round(H[d][g] * 10) / 10) })))}</div>
    <div class="note">Tính từ các dòng “COP status changed”. Ngày thiếu log (máy tắt, hoặc chưa nạp file) không có cột.</div></div>` : ''}`;
}

/* ---- 5. Thuốc thử & vật tư ---- */
function opsReag() {
  const M = S.M; if (!M.has.log) return '<div class="empty">Cần LogFile (máy ghi số test còn lại mỗi lần quét hộp thuốc thử).</div>';
  const km = kitAssayMap(), A = OPS.assay;
  const integ = opsArr(M.integ); if (!integ.length) return '<div class="empty">Không có bản ghi quét hộp thuốc thử trong khoảng đã chọn.</div>';
  // lần quét cuối của mỗi làn
  const lastScan = integ.at(-1).t, byLane = new Map();
  for (const e of integ) if (lastScan - e.t < 3 * 864e5) byLane.set(e.lane, e);
  const removed = opsArr(M.integ).length; void removed;
  const onBoard = [...byLane.values()].filter(e => lastScan - e.t < 864e5).map(e => ({ ...e, assay: km.get(e.lot + '|' + e.kit) || '?' })).filter(e => !A || e.assay === A).sort((a, b) => a.assay.localeCompare(b.assay) || a.lane - b.lane);
  // mức dùng: test (BN + QC + chuẩn) mỗi ngày có chạy, 14 ngày gần nhất có dữ liệu
  const use = {}; const ds = [...new Set(S.D.map(r => r.day))].sort().slice(-14);
  for (const r of S.D) if (r.cat !== 'clean' && ds.includes(r.day)) use[r.assay] = (use[r.assay] || 0) + 1;
  const perA = [...groupBy(onBoard, e => e.assay)].map(([a, L]) => { const rem = L.reduce((s, e) => s + (e.exp ? 0 : e.det), 0), u = (use[a] || 0) / Math.max(1, ds.length); return { a, L, rem, u, days: u ? rem / u : Infinity }; }).sort((x, y) => x.days - y.days);
  const aRows = perA.map(p => `<tr><td>${esc(p.a)}</td><td class="num">${p.L.length}</td><td class="num"><b>${p.rem}</b></td><td class="num">${fmt(p.u, 1)}</td><td class="num">${Number.isFinite(p.days) ? `<span class="pill ${p.days < 2 ? 'p-crit' : p.days < 5 ? 'p-high' : 'p-ok'}">${fmt(p.days, 1)} ngày</span>` : '–'}</td><td class="mono">${p.L.map(e => `L${e.lane}:${e.det}${e.exp ? '(HH)' : ''}`).join(' ')}</td></tr>`).join('');
  // hộp đã dùng trong kỳ, số test thực tế mỗi hộp
  const D = S.D.filter(r => r.cat !== 'clean' && opsInRange(+r.time) && (!A || r.assay === A));
  const kits = [...groupBy(D, r => r.assay + '|' + r.lot + '|' + r.serial)].map(([k, L]) => { const [a, lot, ser] = k.split('|'); const sc = M.integ.filter(e => e.lot === lot && e.kit === ser); return { a, lot, ser, n: L.length, first: L[0].ts, last: L.at(-1).ts, max: sc.length ? Math.max(...sc.map(e => e.det)) : NaN, min: sc.length ? Math.min(...sc.map(e => e.det)) : NaN }; });
  const kRows = [...groupBy(kits, k => k.a)].sort().map(([a, L]) => `<tr><td>${esc(a)}</td><td class="num">${L.length}</td><td class="num">${fmt(L.reduce((s, k) => s + k.n, 0) / L.length, 1)}</td><td class="num">${new Set(L.map(k => k.lot)).size}</td><td class="mono">${esc([...new Set(L.map(k => k.lot))].join(', '))}</td></tr>`).join('');
  // Starter & vật tư
  const st = new Map(); for (const e of opsArr(M.starter)) st.set(e.lane, e);
  const ph = [...groupBy(opsArr(M.phases), e => e.item)].map(([it, L]) => ({ it, red: L.filter(e => e.ph === 'red').length, yel: L.filter(e => e.ph === 'yellow').length, last: L.filter(e => e.ph !== 'green').at(-1) }));
  const PH_VI = { 'Disposable Tips': 'Đầu côn (tips)', 'Cuvettes': 'Cuvette', 'System Liquid': 'Dung dịch hệ thống', 'Wash Liquid': 'Dung dịch rửa', 'Liquid Waste': 'Thải lỏng', 'Solid Waste': 'Thải rắn' };
  const ab = opsArr(M.aborts).filter(e => /Reagent|Starter|Integral/i.test(e.reason) && (!A || e.assay === A));
  return `<div class="kpis">
    ${kpi('Lần quét hộp gần nhất', tStr(lastScan).slice(5), `${byLane.size} làn có hộp`)}
    ${kpi('Sắp hết (&lt; 2 ngày)', perA.filter(p => p.days < 2).length, perA.filter(p => p.days < 2).map(p => p.a).join(', '), perA.some(p => p.days < 2))}
    ${kpi('Test huỷ do thuốc thử', ab.length, [...groupBy(ab, e => viReason(e.reason))].map(([k, L]) => `${L.length} ${k.toLowerCase()}`).join(' · '), ab.length > 0)}
    ${kpi('Báo đỏ vật tư', ph.reduce((a, p) => a + p.red, 0), 'lần vật tư/thải vào mức đỏ')}
  </div>
  <div class="card"><div class="hd"><h2>Thuốc thử trên máy và dự báo ngày hết</h2><span class="sub">Theo lần quét cuối (${tStr(lastScan)}); mức dùng = test BN + QC + chuẩn trung bình mỗi ngày có chạy trong ${ds.length} ngày gần nhất</span></div>
    ${aRows ? `<div class="scroll"><table><thead><tr><th>Xét nghiệm</th><th class="num">Số hộp</th><th class="num">Test còn lại</th><th class="num">Dùng/ngày</th><th class="num">Đủ dùng</th><th>Làn: test còn (HH = hết hạn)</th></tr></thead><tbody>${aRows}</tbody></table></div>` : '<div class="empty">Không có.</div>'}
    <div class="note">Xét nghiệm của mỗi hộp được nhận ra qua Integral Lot/Serial trong FinishedJobs hoặc dòng “Calibration for Integral in lane …”; hộp chưa chạy test nào hiện “?”. Dự báo giả định mức dùng giữ như các ngày gần đây.</div></div>
  <div class="grid2">
    <div class="card"><div class="hd"><h2>Hộp thuốc thử đã dùng trong kỳ</h2></div>${kRows ? `<div class="scroll"><table><thead><tr><th>XN</th><th class="num">Số hộp</th><th class="num">Test/hộp (TB)</th><th class="num">Số lô</th><th>Lô</th></tr></thead><tbody>${kRows}</tbody></table></div>` : '<div class="empty">Không có.</div>'}</div>
    <div class="card"><div class="hd"><h2>Starter và vật tư tiêu hao</h2></div>
      ${st.size ? `<div class="scroll"><table><thead><tr><th>Starter (làn)</th><th>Lô / lọ</th><th class="num">Lượt bắn còn khi nạp</th><th>Nạp lúc</th></tr></thead><tbody>${[...st.values()].sort((a, b) => a.lane - b.lane).map(e => `<tr><td>Làn ${e.lane}</td><td class="mono">${esc(e.lot)} / ${esc(e.vial)}</td><td class="num">${e.shots}</td><td class="mono">${tStr(e.t)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${ph.length ? `<div class="scroll"><table><thead><tr><th>Vật tư / thải</th><th class="num">Lần vàng</th><th class="num">Lần đỏ</th><th>Cảnh báo gần nhất</th></tr></thead><tbody>${ph.map(p => `<tr><td>${esc(PH_VI[p.it] || p.it)}</td><td class="num">${p.yel}</td><td class="num">${p.red ? `<span class="pill p-high">${p.red}</span>` : 0}</td><td class="mono">${p.last ? tStr(p.last.t) + ' ' + (p.last.ph === 'red' ? 'đỏ' : 'vàng') : '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="note">Vàng = sắp hết/sắp đầy, đỏ = hết/đầy theo cảm biến của máy.</div></div>
  </div>`;
}

/* ---- 6. Pha loãng ---- */
function opsDil() {
  const A = OPS.assay, M = S.M || emptyM();
  const D = S.D.filter(r => r.cat === 'patient' && opsInRange(+r.time) && (!A || r.assay === A));
  const byCyc = new Map(S.D.map(r => [+r.cycle, r]));
  const dil = D.filter(r => r.dil > 1), logDil = opsArr(M.dil).filter(e => !A || e.assay === A);
  const above = D.filter(r => r.qual === '>' && r.dil <= 1);
  const later = new Map(); for (const r of D) if (r.dil > 1) { const k = r.sid + '|' + r.assay; (later.get(k) || later.set(k, []).get(k)).push(r); }
  const aRows = [...groupBy(D, r => r.assay)].sort().map(([a, L]) => { const ab = L.filter(r => r.qual === '>' && r.dil <= 1), dl = L.filter(r => r.dil > 1), fol = ab.filter(r => (later.get(r.sid + '|' + a) || []).some(x => x.time >= r.time)).length;
    return (ab.length || dl.length) ? `<tr><td>${esc(a)}</td><td class="num">${L.length}</td><td class="num">${ab.length}</td><td class="num">${dl.length}</td><td class="num">${ab.length ? `${fol}/${ab.length}` : '–'}</td><td class="mono">${esc([...new Set(dl.map(r => '1:' + fmt(r.dil, 2)))].join(', '))}</td></tr>` : ''; }).join('');
  const notFol = above.filter(r => !(later.get(r.sid + '|' + r.assay) || []).some(x => x.time >= r.time));
  const rows = dil.slice().reverse().slice(0, 300).map(r => { const lg = logDil.find(e => e.job === +r.cycle); return `<tr><td class="mono">${r.ts.slice(5, 16)}</td><td>${sidBtn(r.sid)}</td><td>${esc(r.assay)}</td><td class="num">1:${fmt(r.dil, 2)}</td><td class="num">${esc(r.doseRaw)}</td><td>${flagPills(r.flags)}</td><td class="cat">${lg ? 'DilutionLog ✓' : ''}</td></tr>`; }).join('');
  void byCyc;
  return `<div class="kpis">
    ${kpi('Test BN pha loãng', dil.length, `${pct(dil.length, D.length)} test BN`)}
    ${kpi('Kết quả “&gt;” chưa pha loãng', above.length, 'trên giới hạn đo, cột Dilution Factor = 1')}
    ${kpi('… không thấy chạy lại pha loãng', notFol.length, 'trong dữ liệu đang mở', notFol.length > 0)}
    ${kpi('Lần pha loãng tự động (DilutionLog)', logDil.length, M.has && M.has.dil ? '' : 'cần file sao lưu .zip')}
  </div>
  <div class="card"><div class="hd"><h2>Theo xét nghiệm</h2></div>${aRows ? `<div class="scroll"><table><thead><tr><th>XN</th><th class="num">Test BN</th><th class="num">Kết quả “&gt;”</th><th class="num">Pha loãng</th><th class="num">“&gt;” đã chạy lại pha loãng</th><th>Hệ số</th></tr></thead><tbody>${aRows}</tbody></table></div>` : '<div class="empty">Không có kết quả vượt ngưỡng đo hay pha loãng.</div>'}</div>
  ${notFol.length ? `<div class="card"><div class="hd"><h2>Kết quả “&gt;” chưa thấy chạy lại pha loãng</h2><span class="sub">Có thể đã pha loãng thủ công / gửi nơi khác, hoặc trả kết quả “&gt;”</span></div><div class="tablebox" style="max-height:320px"><table><thead><tr><th>Thời điểm</th><th>Mã mẫu</th><th>XN</th><th class="num">Kết quả</th></tr></thead><tbody>${notFol.map(r => `<tr><td class="mono">${r.ts.slice(5, 16)}</td><td>${sidBtn(r.sid)}</td><td>${esc(r.assay)}</td><td class="num">${esc(r.doseRaw)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ${rows ? `<div class="card"><div class="hd"><h2>Test pha loãng</h2></div><div class="tablebox" style="max-height:380px"><table><thead><tr><th>Thời điểm</th><th>Mã mẫu</th><th>XN</th><th class="num">Hệ số</th><th class="num">Kết quả</th><th>Cờ</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>` : ''}`;
}

/* ---- 7. LIS ---- */
function opsLIS() {
  const M = S.M, A = OPS.assay;
  const Q = opsArr(M.lisQ), O = opsArr(M.lisO).filter(e => !A || e.assay === A), R = opsArr(M.lisR).filter(e => !A || e.assay === A), TO = opsArr(M.lisTo);
  const jobs = opsFilter(opsJobs().jobs);
  const lisT0 = M.lisR.length ? Math.min(M.lisR[0].t, (M.lisQ[0] || { t: Infinity }).t) : 0, lisT1 = M.lisR.length ? M.lisR.at(-1).t : 0;
  const cover = jobs.filter(j => j.t >= lisT0 && j.t <= lisT1);
  const unsent = cover.filter(j => !j.sent);
  const resp = jobs.map(j => j.lisResp).filter(Number.isFinite);
  // y lệnh không có kết quả
  const resBy = groupBy(S.D.filter(r => r.cat === 'patient'), r => r.sid);
  const noRes = O.filter(o => o.t <= lisT1 - 864e5 || o.t <= (S.D.length ? +S.D.at(-1).time : 0) - 864e5).filter(o => !(resBy.get(o.sid) || []).some(r => r.assay === o.assay && +r.time >= o.t - 3600e3 && +r.time - o.t < 3 * 864e5));
  const tests = [...groupBy(M.lisR, e => e.test)].sort((a, b) => b[1].length - a[1].length);
  const mapRows = tests.map(([t, L]) => { const a = LISMAP[t] || ''; const ag = L.filter(e => e.assay).map(e => { const r = (resBy.get(e.sid) || []).find(r => Math.abs(+r.time - e.rt) <= 2000); if (!r) return null; const c = classify(r); return (e.flag === 'H') === (c === 'high') && (e.flag === 'L') === (c === 'low'); }).filter(x => x !== null);
    return `<tr><td class="mono">${esc(t)}</td><td>${esc(a || '?')}${a && a !== t ? ' <span class="pill p-low">khác tên</span>' : ''}</td><td>${esc(LISU[a] || L[0].unit || '')}</td><td class="num">${L.length}</td><td class="num">${L.filter(e => e.flag === 'H').length}</td><td class="num">${L.filter(e => e.flag === 'L').length}</td><td class="num">${ag.length ? pct(ag.filter(Boolean).length, ag.length) : '–'}</td></tr>`; }).join('');
  const dl = [...new Set(TO.map(e => dStr(e.t)).concat(Q.map(e => dStr(e.t))))].sort();
  const hrs = [...Array(24).keys()].filter(h => TO.some(e => new Date(e.t).getHours() === h) || Q.some(e => new Date(e.t).getHours() === h));
  return `<div class="kpis">
    ${kpi('Lần máy hỏi y lệnh', fmt(Q.length, 0), `${fmt(Q.reduce((a, e) => a + e.sids.length, 0), 0)} lượt mã mẫu`)}
    ${kpi('Y lệnh LIS gửi về', fmt(O.length, 0), [...groupBy(O, e => e.prio)].map(([p, L]) => `${L.length} ${p === 'S' ? 'cấp cứu (S)' : p === 'R' || p === 'N' ? `thường (${p})` : 'ưu tiên ' + p}`).join(' · '))}
    ${kpi('LIS không phản hồi', TO.length, `${new Set(TO.map(e => e.sid)).size} mã mẫu chờ quá ${TO[0] ? TO[0].sec : 60} giây`, TO.length > 0)}
    ${kpi('LIS trả y lệnh (trung vị)', resp.length ? fmt(medOf(resp), 1) + ' giây' : '–', resp.length ? `p90 ${fmt(qOf(resp, .9), 1)} giây` : '')}
    ${kpi('Kết quả đã gửi LIS', fmt(R.length, 0), `trung vị ${minFmt(medOf(jobs.map(j => j.lisSend)))} sau khi có kết quả`)}
    ${kpi('Kết quả BN chưa thấy gửi', unsent.length, cover.length ? pct(unsent.length, cover.length) + ' trong thời gian có vết LIS' : '', unsent.length > 0)}
  </div>
  ${dl.length ? `<div class="grid2"><div class="card"><div class="hd"><h2>LIS không phản hồi theo ngày</h2></div><div class="scroll">${stackedBars(dl.map(d => d.slice(8) + '/' + d.slice(5, 7)), [{ name: 'Không phản hồi', color: 'var(--crit)', values: dl.map(d => TO.filter(e => dStr(e.t) === d).length) }])}</div></div>
    <div class="card"><div class="hd"><h2>Theo giờ trong ngày</h2></div><div class="legend"><span><i style="background:var(--crit)"></i>Không phản hồi</span><span><i style="background:var(--accent)"></i>Lần hỏi có phản hồi</span></div><div class="scroll">${stackedBars(hrs.map(h => p2(h) + 'h'), [{ name: 'Không phản hồi', color: 'var(--crit)', values: hrs.map(h => TO.filter(e => new Date(e.t).getHours() === h).length) }, { name: 'Có phản hồi', color: 'var(--accent)', values: hrs.map(h => Math.max(0, Q.filter(e => new Date(e.t).getHours() === h).length - TO.filter(e => new Date(e.t).getHours() === h).length)) }])}</div></div></div>` : ''}
  <div class="card"><div class="hd"><h2>Mã xét nghiệm LIS ↔ máy, đơn vị và cờ</h2><span class="sub">Đơn vị LIS gửi được dùng làm đơn vị chính thức trong toàn công cụ</span></div>
    ${mapRows ? `<div class="scroll"><table><thead><tr><th>Mã LIS</th><th>Xét nghiệm trên máy</th><th>Đơn vị</th><th class="num">KQ gửi</th><th class="num">Cờ H</th><th class="num">Cờ L</th><th class="num">Cờ H/L khớp KTC công cụ</th></tr></thead><tbody>${mapRows}</tbody></table></div>` : '<div class="empty">Không có kết quả gửi LIS.</div>'}</div>
  <div class="grid2">
    <div class="card"><div class="hd"><h2>Kết quả BN chưa thấy gửi LIS</h2><span class="sub">${unsent.length}</span></div>${unsent.length ? `<div class="tablebox" style="max-height:320px"><table><thead><tr><th>Có KQ lúc</th><th>Mã mẫu</th><th>XN</th><th class="num">KQ</th></tr></thead><tbody>${unsent.slice(-300).reverse().map(j => `<tr><td class="mono">${tStr(j.t).slice(5)}</td><td>${sidBtn(j.sid)}</td><td>${esc(j.assay)}</td><td class="num">${esc(j.r.doseRaw)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Mọi kết quả BN đều đã gửi.</div>'}
      <div class="note">Có thể do kết quả bị giữ lại chờ duyệt, test chạy lại (chỉ gửi lần sau), hoặc vết LIS không phủ hết thời gian.</div></div>
    <div class="card"><div class="hd"><h2>Y lệnh chưa thấy kết quả</h2><span class="sub">${noRes.length} (sau 3 ngày)</span></div>${noRes.length ? `<div class="tablebox" style="max-height:320px"><table><thead><tr><th>Nhận y lệnh</th><th>Mã mẫu</th><th>XN</th></tr></thead><tbody>${noRes.slice(-300).reverse().map(o => `<tr><td class="mono">${tStr(o.t).slice(5)}</td><td>${sidBtn(o.sid)}</td><td>${esc(o.assay)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Không có.</div>'}
      <div class="note">Gồm cả y lệnh bị huỷ, mẫu chuyển máy khác hoặc kết quả nằm ngoài các file đang mở.</div></div>
  </div>`;
}

/* ---- 8. Người dùng ---- */
function opsUser() {
  const U = opsArr(S.M.users);
  const shift = t => { const h = new Date(t).getHours(); return h >= 7 && h < 14 ? 'Ca sáng (7–14h)' : h >= 14 && h < 21 ? 'Ca chiều (14–21h)' : 'Ca đêm (21–7h)'; };
  const by = [...groupBy(U, e => e.user)];
  return `<div class="card"><div class="hd"><h2>Đăng nhập phần mềm máy</h2><span class="sub">${U.length} lần</span></div>
    ${by.length ? `<div class="scroll"><table><thead><tr><th>Người dùng</th><th class="num">Mức quyền</th><th class="num">Số lần</th>${['Ca sáng (7–14h)', 'Ca chiều (14–21h)', 'Ca đêm (21–7h)'].map(s => `<th class="num">${s}</th>`).join('')}<th>Lần đầu</th><th>Lần cuối</th></tr></thead><tbody>${by.map(([u, L]) => `<tr><td class="mono">${esc(u)}</td><td class="num">${esc([...new Set(L.map(e => e.level))].join(', '))}</td><td class="num">${L.length}</td>${['Ca sáng (7–14h)', 'Ca chiều (14–21h)', 'Ca đêm (21–7h)'].map(s => `<td class="num">${L.filter(e => shift(e.t) === s).length || ''}</td>`).join('')}<td class="mono">${tStr(L[0].t)}</td><td class="mono">${tStr(L.at(-1).t)}</td></tr>`).join('')}</tbody></table></div>
      <div class="tablebox" style="max-height:300px"><table><thead><tr><th>Thời điểm</th><th>Người dùng</th><th>Ca</th></tr></thead><tbody>${U.slice().reverse().map(e => `<tr><td class="mono">${tStr(e.t)}</td><td class="mono">${esc(e.user)}</td><td>${shift(e.t)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Không có dòng đăng nhập có tên người dùng.</div>'}
    <div class="note">Máy chỉ ghi lúc đăng nhập (thường khi khởi động phần mềm). Nếu cả phòng dùng chung một tài khoản thì không phân biệt được người thao tác.</div></div>`;
}

/* ---- 9. Hành trình mẫu ---- */
function opsJourney() {
  const sid = OPS.sid, M = S.M;
  const form = `<form class="filters" id="jrForm"><label>Sample ID<input type="text" id="jrSid" value="${esc(sid)}" placeholder="vd 90952" autocomplete="off"></label><button class="btn primary" type="submit">Xem hành trình</button></form>`;
  if (!sid) return form + '<div class="empty">Nhập một Sample ID (hoặc bấm vào mã mẫu ở các bảng khác) để xem toàn bộ hành trình: nạp ống → hỏi LIS → nhận y lệnh → lên lịch → hút mẫu → pha loãng → kết quả → gửi LIS.</div>';
  const ev = [];
  const add = (t, k, txt, bad) => ev.push({ t, k, txt, bad });
  for (const e of M.tubes) if (e.sid === sid) add(e.t, 'Nạp ống', `Làn ${e.lane}, vị trí ${e.pos}`);
  for (const e of M.unl) if (e.sid === sid) add(e.t, 'Rút ống', `Làn ${e.lane}`);
  for (const e of M.lisQ) if (e.sids.includes(sid)) add(e.t, 'Hỏi LIS', e.sids.length > 1 ? `cùng ${e.sids.length - 1} mẫu khác` : '');
  const ords = M.lisO.filter(e => e.sid === sid); for (const [t, L] of groupBy(ords, e => Math.round(e.t / 5000))) add(L[0].t, 'LIS gửi y lệnh', L.map(e => e.assay + (e.prio && e.prio !== 'N' ? ` (${e.prio})` : '')).join(', '));
  for (const e of M.lisTo) if (e.sid === sid) add(e.t, 'LIS không phản hồi', `sau ${e.sec} giây`, true);
  for (const e of M.sched) if (e.sid === sid) add(e.t, 'Lên lịch', `${e.assay} (lần ${e.rep})`);
  for (const e of M.asp) if (e.sid === sid) add(e.t, 'Hút mẫu', `${e.assay} · JobID ${e.job}`);
  for (const e of M.fails) if (e.sid === sid) add(e.t, 'Hút lỗi', `${e.assay}: ${viReason(e.reason)}`, true);
  for (const e of M.aborts) if (e.sid === sid) add(e.t, 'Huỷ test', `${e.assay}: ${viReason(e.reason)}`, true);
  const D = S.D.filter(r => r.sid === sid);
  const cyc = new Set(D.map(r => +r.cycle)); for (const e of M.dil) if (cyc.has(e.job)) add(e.t, 'Pha loãng', `${e.assay} 1:${fmt(e.f, 2)}`);
  for (const r of D) add(+r.time, 'Kết quả', `${r.assay}: ${r.doseRaw}${unitOf(r.assay) ? ' ' + unitOf(r.assay) : ''}${r.flags.length ? ' · ' + r.flags.join(', ') : ''}${r.dil > 1 ? ' · pha loãng 1:' + fmt(r.dil, 2) : ''}`, r.flags.some(f => !/NormalRange/.test(f)));
  for (const e of M.lisR) if (e.sid === sid) add(e.t, 'Gửi LIS', `${e.test}: ${e.val} ${e.unit}${e.flag && e.flag !== 'N' ? ' · cờ ' + e.flag : ''}`);
  ev.sort((a, b) => a.t - b.t);
  if (!ev.length) return form + `<div class="empty">Không tìm thấy Sample ID “${esc(sid)}” trong dữ liệu đang mở.</div>`;
  const J = opsJobs().jobs.filter(j => j.sid === sid);
  const C = { 'Nạp ống': 'var(--c1)', 'Rút ống': 'var(--line)', 'Hỏi LIS': 'var(--c7)', 'LIS gửi y lệnh': 'var(--c7)', 'LIS không phản hồi': 'var(--crit)', 'Lên lịch': 'var(--c6)', 'Hút mẫu': 'var(--c3)', 'Hút lỗi': 'var(--crit)', 'Huỷ test': 'var(--crit)', 'Pha loãng': 'var(--c2)', 'Kết quả': 'var(--c4)', 'Gửi LIS': 'var(--c7)' };
  const t0 = ev[0].t;
  return form + `${J.length ? `<div class="card"><div class="hd"><h2>Tóm tắt ${esc(sid)}</h2></div><div class="scroll"><table><thead><tr><th>XN</th><th>Nạp ống</th><th class="num">Chờ hút</th><th class="num">Ủ & đo</th><th class="num">TAT</th><th>Kết quả</th><th class="num">Gửi LIS sau</th><th>Ghi chú</th></tr></thead><tbody>${J.map(j => `<tr><td>${esc(j.assay)}</td><td class="mono">${Number.isFinite(j.t0) ? tStr(j.t0).slice(5) : '–'}</td><td class="num">${minFmt(j.wait)}</td><td class="num">${minFmt(j.run)}</td><td class="num"><b>${minFmt(j.tat)}</b></td><td class="num">${esc(j.r.doseRaw)}</td><td class="num">${minFmt(j.lisSend)}</td><td>${j.reasons.map(r => `<span class="pill p-high">${esc(r.t)}</span>`).join('')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  <div class="card"><div class="hd"><h2>Dòng thời gian</h2><span class="sub">${ev.length} sự kiện</span></div>
    <div class="tablebox" style="max-height:560px"><table><thead><tr><th>Thời điểm</th><th class="num">+ phút</th><th>Bước</th><th>Chi tiết</th></tr></thead><tbody>${ev.map(e => `<tr${e.bad ? ' class="hl"' : ''}><td class="mono">${sStr(e.t)}</td><td class="num">${fmt((e.t - t0) / 60e3, 1)}</td><td><span class="pill" style="background:var(--sunk);color:${C[e.k]}">${e.k}</span></td><td>${esc(e.txt)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

/* Cảnh báo từ nhật ký máy (gộp vào tab Cảnh báo) */
function opsAlerts() {
  const M = S.M, A = [];
  if (M.has.log) {
    for (const e of M.aborts) if (!/Clot|Sample not present/.test(e.reason)) A.push({ sev: /Mechanical/.test(e.reason) ? 'crit' : 'warn', time: e.t, t: `Huỷ test do ${viReason(e.reason).toLowerCase()}: ${e.sid} · ${e.assay}`, d: `${sStr(e.t)} · ${e.reason}` });
    const clot = groupBy(M.aborts.filter(e => /Clot/.test(e.reason)), e => dStr(e.t));
    for (const [d, L] of clot) A.push({ sev: L.length >= 3 ? 'warn' : 'info', time: L.at(-1).t, t: `${L.length} test huỷ do cục đông ngày ${d}`, d: L.map(e => `${e.sid} ${e.assay}`).join(', ') + '. Kiểm tra quy trình ly tâm, thể tích mẫu.' });
    for (const c of M.chk) if (!c.ok) A.push({ sev: 'crit', time: c.t, t: `${c.kind} không đạt`, d: `${sStr(c.t)} · TB ${fmt(c.mean, 0)} RLU · CV ${fmt(c.cv, 1)}%` });
    for (const e of M.maint) if (e.st === 'fail') A.push({ sev: 'warn', time: e.t, t: `Bước bảo trì lỗi: ${MAINT_VI[e.task] || e.task}`, d: `${sStr(e.t)} · bước ${e.step}: ${e.stepName}` });
    for (const e of tempEpisodes()) if (!e.startup && (e.dur > 15 || !Number.isFinite(e.dur))) A.push({ sev: 'warn', time: e.t0, t: `${e.part} ngoài khoảng nhiệt độ ${Number.isFinite(e.dur) ? minFmt(e.dur) : '(chưa thấy trở lại bình thường)'}`, d: `${sStr(e.t0)} · ${fmt(e.vmin, 1)}–${fmt(e.vmax, 1)} °C` });
    const comp = maintCompliance(M); for (const c of comp) if (c.unit !== 'ngày' && c.miss.length) A.push({ sev: 'warn', time: Date.now(), t: `Không thấy bảo trì ${c.f.toLowerCase()} trong ${c.miss.length} ${c.unit}`, d: c.miss.join(', ') });
  }
  if (M.lisTo.length) { const by = groupBy(M.lisTo, e => dStr(e.t)); for (const [d, L] of by) if (L.length >= 10) A.push({ sev: 'warn', time: L.at(-1).t, t: `LIS không phản hồi ${L.length} lần ngày ${d}`, d: `Máy hỏi y lệnh nhưng LIS không trả lời trong ${L[0].sec} giây; mẫu phải chờ hoặc nhập tay.` }); }
  return A;
}

/* Bảng Excel cho báo cáo vận hành */
function sheetsOps() {
  const M = S.M, out = [], { jobs } = opsJobs(), T = OPS.target;
  if (M.has.log || M.has.lis) out.push({ name: 'TAT từng test', rows: [['Sample ID', 'Xét nghiệm', 'Nạp ống', 'Hỏi LIS', 'Nhận y lệnh', 'Hút mẫu', 'Có kết quả', 'Gửi LIS', 'TAT (phút)', 'Chờ hút (phút)', 'Ủ & đo (phút)', 'LIS trả y lệnh (giây)', `Quá ${T} phút`, 'Chạy lại', 'Kết quả', 'Ghi chú']]
    .concat(jobs.map(j => [j.sid, j.assay, Number.isFinite(j.t0) ? sStr(j.t0) : '', j.q ? sStr(j.q.t) : '', j.ord ? sStr(j.ord.t) : '', j.asp ? sStr(j.asp.t) : '', sStr(j.t), j.sent ? sStr(j.sent.t) : '', r4(j.tat), r4(j.wait), r4(j.run), r4(j.lisResp), j.tat > T ? 'Có' : '', j.isRerun ? 'Có' : '', j.r.doseRaw, j.reasons.map(x => x.t).join('; ')])) });
  const W = jobs.filter(j => Number.isFinite(j.tat) && j.tat >= 0 && j.tat < 1440);
  if (W.length) out.push({ name: 'TAT theo XN', rows: [['Xét nghiệm', 'n', 'Trung vị (phút)', 'p90 (phút)', `% quá ${T} phút`, 'Chờ hút TV', 'Ủ & đo TV', 'Gửi LIS TV']].concat([...groupBy(W, j => j.assay)].map(([a, L]) => [a, L.length, r4(medOf(L.map(j => j.tat))), r4(qOf(L.map(j => j.tat), .9)), r4(L.filter(j => j.tat > T).length / L.length * 100), r4(medOf(L.map(j => j.wait))), r4(medOf(L.map(j => j.run))), r4(medOf(L.map(j => j.lisSend)))])) });
  if (M.has.log) {
    out.push({ name: 'Huỷ test', rows: [['Thời điểm', 'Sample ID', 'Xét nghiệm', 'Lần', 'Lý do', 'Lý do (VN)', 'Nhóm']].concat(M.aborts.map(e => [sStr(e.t), e.sid, e.assay, e.rep, e.reason, viReason(e.reason), abortCat(e.reason)])) });
    out.push({ name: 'Bảo trì nhật ký', rows: [['Thời điểm', 'Quy trình', 'Tần suất', 'Bước', 'Tên bước', 'Kết quả']].concat(M.maint.map(e => [sStr(e.t), e.task, { day: 'Ngày', week: 'Tuần', month: 'Tháng', other: '' }[maintFreq(e.task)], e.step || '', e.stepName, e.st === 'ok' ? 'Hoàn tất' : e.st === 'fail' ? 'Lỗi' : 'Huỷ'])) });
    out.push({ name: 'BGW & Light Check', rows: [['Thời điểm', 'Kiểm tra', 'Đạt', 'RLU TB', 'CV%']].concat(M.chk.map(c => [sStr(c.t), c.kind, c.ok ? 'Đạt' : 'Không đạt', c.mean, c.cv])) });
    out.push({ name: 'Nhiệt độ', rows: [['Bắt đầu', 'Kết thúc', 'Bộ phận', 'Phút', 'Thấp nhất °C', 'Cao nhất °C', 'Lúc khởi động']].concat(tempEpisodes().map(e => [sStr(e.t0), Number.isFinite(e.t1) ? sStr(e.t1) : '', e.part, r4(e.dur), e.vmin, e.vmax, e.startup ? 'Có' : ''])) });
    const km = kitAssayMap();
    out.push({ name: 'Quét hộp thuốc thử', rows: [['Thời điểm', 'Làn', 'Xét nghiệm', 'Mã hàng', 'Lô', 'Kit', 'Test còn', 'Hiệu chuẩn còn', 'Hết hạn']].concat(M.integ.map(e => [sStr(e.t), e.lane, km.get(e.lot + '|' + e.kit) || '', e.art, e.lot, e.kit, e.det, e.cal, e.exp ? 'Có' : ''])) });
    out.push({ name: 'Trạng thái máy', rows: [['Ngày', ...Object.values(STATE_LABEL)]].concat(Object.entries(stateHours()).sort().map(([d, h]) => [d, ...Object.keys(STATE_LABEL).map(k => r4(h[k]))])) });
  }
  if (M.dil.length || S.D.some(r => r.dil > 1)) out.push({ name: 'Pha loãng', rows: [['Thời điểm', 'Sample ID', 'Xét nghiệm', 'Hệ số', 'Kết quả', 'Cờ']].concat(S.D.filter(r => r.dil > 1).map(r => [r.ts, r.sid, r.assay, r.dil, r.doseRaw, r.flags.join(' ')])) });
  if (M.has.lis) {
    out.push({ name: 'LIS không phản hồi', rows: [['Thời điểm', 'Sample ID', 'Chờ (giây)']].concat(M.lisTo.map(e => [sStr(e.t), e.sid, e.sec])) });
    out.push({ name: 'LIS mã xét nghiệm', rows: [['Mã LIS', 'Xét nghiệm trên máy', 'Đơn vị', 'Số KQ gửi', 'Cờ H', 'Cờ L']].concat([...groupBy(M.lisR, e => e.test)].map(([t, L]) => [t, LISMAP[t] || '', LISU[LISMAP[t]] || L[0].unit, L.length, L.filter(e => e.flag === 'H').length, L.filter(e => e.flag === 'L').length])) });
  }
  return out;
}
