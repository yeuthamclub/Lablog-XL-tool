/* ---------- Xuất báo cáo: PDF (bản in A4), Excel (.xlsx), CSV ---------- */

const APP_VERSION = '1.2.0';
let LAB = { org: '', dept: '', instrument: '', author: '', reviewer: '', approver: '' };
try { Object.assign(LAB, JSON.parse(localStorage.getItem('lablog-lab') || '{}')); } catch (e) {}
const saveLab = () => { try { localStorage.setItem('lablog-lab', JSON.stringify(LAB)); } catch (e) {} };

const RP_SECTIONS = {
  activity: 'Tổng hợp hoạt động',
  qc: 'Kiểm soát chất lượng (QC, Levey-Jennings, PBRTQC)',
  reagent: 'Thuốc thử & hiệu chuẩn',
  maint: 'Bảo trì (CLEAN và nhật ký máy)',
  ops: 'Vận hành máy (TAT, huỷ test, nhiệt độ, thuốc thử, pha loãng, LIS)',
  dist: 'Phân bố & đối chiếu theo Sample ID',
  ri: 'Khảo sát khoảng tham chiếu',
  alerts: 'Cảnh báo'
};
const RP_TEMPLATES = {
  qc: { t: 'Báo cáo QC', s: ['qc', 'reagent'] },
  maint: { t: 'Báo cáo bảo trì', s: ['maint'] },
  dist: { t: 'Báo cáo phân bố kết quả', s: ['dist'] },
  ri: { t: 'Báo cáo khảo sát khoảng tham chiếu', s: ['ri'] },
  alerts: { t: 'Báo cáo cảnh báo', s: ['alerts'] },
  ops: { t: 'Báo cáo vận hành', s: ['ops', 'maint', 'alerts'] },
  activity: { t: 'Báo cáo tổng hợp hoạt động', s: ['activity', 'maint', 'alerts'] },
  full: { t: 'Báo cáo tổng hợp đầy đủ', s: Object.keys(RP_SECTIONS) }
};
let RP = { tpl: 'qc', secs: new Set(RP_TEMPLATES.qc.s), from: '', to: '', mask: true, raw: true, last: null };

// Ẩn bớt Sample ID bệnh nhân (giữ duy nhất, để ghép cặp xét nghiệm vẫn đúng)
function makeMasker() {
  const map = new Map(), used = new Set();
  return sid => {
    if (map.has(sid)) return map.get(sid);
    let base = sid.length > 6 ? sid.slice(0, 4) + '***' + sid.slice(-2) : sid.length > 2 ? sid[0] + '***' + sid.slice(-1) : '***';
    let m = base, k = 2; while (used.has(m)) m = base + '·' + k++;
    used.add(m); map.set(sid, m); return m;
  };
}

function periodData(from, to, mask) {
  const inR = r => (!from || r.day >= from) && (!to || r.day <= to);
  const mk = mask ? makeMasker() : null;
  const cp = r => (mk && r.cat === 'patient') ? { ...r, sid: mk(r.sid), key: [mk(r.sid), r.assay, r.rep, r.cycle].join('|') } : r;
  // Nhật ký máy: cắt theo kỳ, ẩn Sample ID bệnh nhân giống kết quả
  const inT = e => { const d = dStr(e.t); return (!from || d >= from) && (!to || d <= to); };
  const ms = sid => mk && sid && !/^[#$]/.test(sid) && sid !== 'CLEAN' ? mk(sid) : sid;
  const M = emptyM();
  for (const k in M) M[k] = (S.M[k] || []).filter(inT).map(e => e.sids ? { ...e, sids: e.sids.map(ms) } : e.sid !== undefined ? { ...e, sid: ms(e.sid) } : e);
  M.has = S.M.has;
  return { D: S.D.filter(inR).map(cp), R: S.R.filter(inR).map(cp), files: S.files, stats: S.stats, sample: S.sample, serials: S.serials, M };
}

/* Chạy hàm f với tập dữ liệu thay thế (kỳ báo cáo / ẩn ID), sau đó khôi phục */
async function withData(data, f) {
  assays().forEach(refInfo);                          // KTC suy từ cờ luôn tính trên toàn bộ dữ liệu
  const saved = { S, ver: RIS.ver, qa: QCV.assay, cell: DIST.cell, ops: { ...OPS } };
  S = data; RIS.ver = 'rp' + Date.now(); QCV.assay = ''; DIST.cell = null; Object.assign(OPS, { assay: '', from: '', to: '', cache: null });
  try { return await f(); }
  finally { S = saved.S; RIS.ver = saved.ver; QCV.assay = saved.qa; DIST.cell = saved.cell; Object.assign(OPS, saved.ops, { cache: null }); renderAll(); }
}

// Lấy HTML một panel sau khi dựng với dữ liệu kỳ báo cáo; bỏ phần điều khiển, rút gọn bảng quá dài
function snapshot(html, maxRows = 40) {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('button:not(.linkbtn), input, select, textarea, .filters, .seg, label.cat, #riProg').forEach(e => e.remove());
  d.querySelectorAll('.linkbtn').forEach(b => { const s = document.createElement('span'); s.textContent = b.textContent; b.replaceWith(s); });
  d.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  d.querySelectorAll('tbody').forEach(tb => { const rows = tb.querySelectorAll(':scope > tr'); if (rows.length > maxRows) { for (let i = maxRows; i < rows.length; i++) rows[i].remove(); const tr = document.createElement('tr'); tr.innerHTML = `<td colspan="20" class="note">… còn ${rows.length - maxRows} dòng, xem đầy đủ trong file Excel kèm theo.</td>`; tb.appendChild(tr); } });
  // Danh sách cảnh báo dài: giữ 30 mục đầu mỗi nhóm
  const groups = new Map(); d.querySelectorAll('.alert').forEach(a => { const p = a.parentElement; if (!groups.has(p)) groups.set(p, []); groups.get(p).push(a); });
  for (const [, L] of groups) if (L.length > 30) { L.slice(30).forEach(a => a.remove()); const n = document.createElement('div'); n.className = 'note'; n.textContent = `… còn ${L.length - 30} cảnh báo, xem đầy đủ trong file Excel kèm theo.`; L[29].after(n); }
  return d.innerHTML;
}

/* ---------- Dữ liệu cho Excel ---------- */
const r4 = v => Number.isFinite(v) ? +(+v).toPrecision(6) : '';
function sheetsRaw() {
  return [{ name: 'Kết quả (raw)', rows: [['Thời gian', 'Ngày', 'Sample ID', 'Loại mẫu', 'Xét nghiệm', 'Lần', 'RLU', 'Dose (gốc)', 'Dấu', 'Giá trị', 'Đơn vị', 'Đánh giá KTC', 'Cờ của máy', 'Lô', 'Serial', 'CalibrationID', 'Hệ số pha loãng', 'File']]
    .concat(S.D.map(r => [r.ts, r.day, r.sid, CAT_LABEL[r.cat], r.assay, r.rep, r.rlu, r.doseRaw, r.qual, r4(r.dose), unitOf(r.assay), r.cat === 'clean' ? '' : ST_SHORT[classify(r)], r.flags.join(' '), r.lot, r.serial, r.calId, r.dil, r.file])) }];
}
function sheetsActivity() {
  const res = S.D.filter(r => r.cat !== 'clean'), as = assays(), dl = days(res);
  return [
    { name: 'Số kết quả theo ngày', rows: [['Ngày', ...as, 'Tổng']].concat(dl.map(d => { const c = as.map(a => res.filter(r => r.day === d && r.assay === a).length); return [d, ...c, c.reduce((s, x) => s + x, 0)]; })) },
    { name: 'Theo xét nghiệm', rows: [['Xét nghiệm', 'Đơn vị', 'KTC đang dùng', 'Mẫu BN', 'QC', 'Chuẩn', 'Dưới KTC', 'Trong KTC', 'Trên KTC', 'Dưới ngưỡng đo', 'Trên ngưỡng đo']].concat(as.map(a => {
      const L = res.filter(r => r.assay === a), P = L.filter(r => r.cat === 'patient'), c = { low: 0, normal: 0, high: 0 }; P.forEach(r => c[classify(r)]++);
      return [a, unitOf(a), fmtRef(a), P.length, L.filter(r => r.cat === 'control').length, L.filter(r => r.cat === 'calibrator').length, c.low, c.normal, c.high, P.filter(r => r.flags.includes('BelowAssayRange')).length, P.filter(r => r.flags.includes('AboveAssayRange')).length];
    })) }];
}
function sheetsQC() {
  const G = controlGroups(), stat = [['Xét nghiệm', 'Control', 'n', 'TB', 'SD', 'CV%', 'Thấp nhất', 'Cao nhất', 'Nguồn giới hạn', 'Vi phạm loại', 'Cảnh báo 1-2s', 'Lần chạy cuối']], data = [['Thời gian', 'Xét nghiệm', 'Control', 'Dose', 'Giá trị', 'z', 'Quy tắc vi phạm', 'Cờ của máy', 'Lô', 'Serial']];
  for (const g of G) {
    const t = qcTarget(g.assay, g.sid, g.L), pts = westgard(g.L, t);
    stat.push([g.assay, g.sid, pts.length, r4(t.m), r4(t.s), r4(t.s / t.m * 100), r4(Math.min(...pts.map(p => p.r.dose))), r4(Math.max(...pts.map(p => p.r.dose))), t.src,
      pts.filter(p => p.rules.some(x => RULES[x].sev === 'rej')).length, pts.filter(p => p.rules.length && !p.rules.some(x => RULES[x].sev === 'rej')).length, g.L.at(-1).ts]);
    for (const p of pts) data.push([p.r.ts, g.assay, g.sid, p.r.doseRaw, r4(p.r.dose), r4(p.z), p.rules.join(' '), p.r.flags.join(' '), p.r.lot, p.r.serial]);
  }
  const fq = [['Xét nghiệm', 'Số mức', 'Lần chạy QC', 'Ngày có QC', 'Ngày có BN', 'Ngày BN có QC (%)', 'TB ngày giữa 2 lần QC', 'Max BN giữa 2 lần QC', 'QC gần nhất', 'BN sau QC cuối', 'Ngày chạy BN không có QC']].concat(qcFrequency(G).map(f => [f.assay, f.levels, f.nQC, f.qcDays.size, f.patDays.size, f.patDays.size ? r4([...f.patDays].filter(d => f.qcDays.has(d)).length / f.patDays.size * 100) : '', r4(f.meanGap), f.maxRun, f.lastQC ? f.lastQC.ts : '', f.after, f.noQC.join(' ')]));
  const pbd = [['Xét nghiệm', 'Ngày', 'n', 'Trung vị', 'P25', 'P75']], pbe = [['Xét nghiệm', 'Ngày', 'Sự kiện', 'n trước', 'Trung vị trước', 'n sau', 'Trung vị sau', 'Chênh lệch %', 'p (Mann–Whitney)', 'Đánh giá']];
  for (const a of pbAssays()) { const D = pbData(a); D.days.forEach(d => pbd.push([a, d.day, d.n, r4(d.med), r4(d.q1), r4(d.q3)])); D.cmp.forEach(c => pbe.push([a, c.day, c.txt, c.nb, r4(c.mb), c.na, r4(c.ma), r4(c.d), r4(c.p), c.st.t])); }
  const cal = S.D.filter(r => r.cat === 'calibrator'), runs = {}; for (const r of cal) (runs[r.assay + '|' + r.ts + '|' + r.sid] ||= []).push(r);
  const calRows = [['Thời gian', 'Xét nghiệm', 'Chuẩn', 'n', 'RLU TB', 'SD', 'CV%', 'Dose các lần', 'CalibrationID']].concat(Object.values(runs).map(L => { const rl = L.map(r => r.rlu), m = mean(rl), s = sd(rl); return [L[0].ts, L[0].assay, L[0].sid, L.length, r4(m), r4(s), r4(s / m * 100), L.map(r => r.doseRaw).join(' · '), L[0].calId]; }));
  return [{ name: 'QC thống kê', rows: stat }, { name: 'QC dữ liệu', rows: data }, { name: 'QC tần suất', rows: fq }, { name: 'PBRTQC theo ngày', rows: pbd }, { name: 'PBRTQC sự kiện', rows: pbe }, { name: 'Chạy chuẩn', rows: calRows }];
}
function sheetsReagent() {
  const res = S.D.filter(r => r.cat !== 'clean'), g = {};
  for (const r of res) (g[[r.assay, r.article, r.lot, r.serial].join('|')] ||= []).push(r);
  return [{ name: 'Thuốc thử', rows: [['Xét nghiệm', 'Mã hàng', 'Lô', 'Serial', 'Tổng test', 'BN', 'Dùng lần đầu', 'Dùng lần cuối', 'CalibrationID', 'Kết quả cờ hết hạn']].concat(Object.values(g).map(L => [L[0].assay, L[0].article, L[0].lot, L[0].serial, L.length, L.filter(r => r.cat === 'patient').length, L[0].ts, L.at(-1).ts, [...new Set(L.map(r => r.calId))].join(' '), L.filter(r => r.flags.some(f => /Expired/.test(f))).length])) }];
}
function sheetsMaint() {
  const ss = cleanSessions(), testDays = new Set(S.D.filter(r => r.cat !== 'clean').map(r => r.day)), cd = new Set(ss.map(s => s.day));
  return [{ name: 'CLEAN phiên', rows: [['Bắt đầu', 'Số lần chạy', 'Ra kết quả', 'Giờ từ phiên trước', 'Test kể từ phiên trước', 'Lô/Serial']].concat(ss.map(s => [s.ts, s.total, s.done, r4(s.gapH), s.testsSince, s.kits.join(' ')])) },
    { name: 'Ngày thiếu CLEAN', rows: [['Ngày', 'Số test']].concat([...testDays].filter(d => !cd.has(d)).sort().map(d => [d, S.D.filter(r => r.day === d && r.cat !== 'clean').length])) }];
}
function sheetsDist() {
  const { pass, withT } = runLink(), T = LK.target, conds = LK.conds.filter(c => c.assay && c.state !== 'none'), A = conds.length ? conds[0].assay : null;
  const recs = withT.map(p => p.o[T]), n = recs.length, c3 = { low: 0, normal: 0, high: 0 }; recs.forEach(r => c3[classify(r)]++);
  const grp = [['Điều kiện', 'Xét nghiệm', 'Nhóm', 'Số mẫu', 'Tỷ lệ %']];
  const addG = (cond, a, L) => { const k = { low: 0, normal: 0, high: 0 }; L.forEach(r => k[classify(r)]++); const N = L.length || 1;
    grp.push([cond, a, 'Dưới KTC', k.low, r4(k.low / N * 100)], [cond, a, 'Trong KTC', k.normal, r4(k.normal / N * 100)], [cond, a, 'Trên KTC', k.high, r4(k.high / N * 100)]);
    groupCounts(L, cutsOf(a)).forEach(x => grp.push([cond, a, x.label, x.n, r4(x.n / N * 100)])); };
  const desc = conds.map(condText).join(' và ') || 'mọi mẫu';
  addG(desc, T, recs);
  if (conds.length === 1 && conds[0].state === 'normal' && A && A !== T) { const M = sampleMap(), rev = []; for (const [, o] of M) if (o[T] && o[A] && classify(o[T]) === 'normal') rev.push(o[A]); addG(`${T} trong KTC`, A, rev); }
  const cols = [...new Set([...conds.map(c => c.assay), T])];
  const data = [['Sample ID', ...cols.flatMap(a => [a, a + ' đánh giá'])]].concat(pass.map(p => [p.sid, ...cols.flatMap(a => { const r = p.o[a]; return r ? [r.doseRaw, ST_SHORT[classify(r)]] : ['', '']; })]));
  const out = [{ name: 'Phân bố nhóm', rows: grp }, { name: 'Phân bố dữ liệu', rows: data }];
  if (A && A !== T) {
    const P = pairData(A, T), K = ['low', 'normal', 'high'], m = [['Ô', A, T, 'Số mẫu', 'Tỷ lệ %']];
    for (const ka of K) for (const kb of K) { const k = P.filter(p => p.ca === ka && p.cb === kb).length; m.push([`${A} ${ST_SHORT[ka]} · ${T} ${ST_SHORT[kb]}`, ST_SHORT[ka], ST_SHORT[kb], k, r4(k / (P.length || 1) * 100)]); }
    out.push({ name: 'Ma trận 9 ô', rows: m });
    const dl = discordantList(A, T); if (dl.length) out.push({ name: 'Cặp trái chiều', rows: [['Sample ID', 'Thời gian', A, T, 'Kiểu', 'Lô ' + T]].concat(dl.map(p => [p.sid, p.b.ts, p.a.doseRaw, p.b.doseRaw, p.ca === 'high' ? 'Cùng tăng' : 'Cùng giảm', p.b.lot])) });
  }
  return out;
}
function sheetsAlerts() { return [{ name: 'Cảnh báo', rows: [['Mức', 'Thời gian', 'Nội dung', 'Chi tiết']].concat(buildAlerts().map(a => [a.sev === 'crit' ? 'Cần xử lý' : a.sev === 'warn' ? 'Cần xem lại' : 'Ghi nhận', a.time ? new Date(a.time).toLocaleString('vi-VN') : '', a.t, a.d])) }]; }
const limCell = x => !x ? '' : (x.precise || x.manual) ? r4(x.value) : `≈${r4(x.value)} (trong khoảng ${r4(x.a)} – ${r4(x.b)}, chưa xác định chính xác)`;
function sheetsRI(results) {
  const sum = [['Xét nghiệm', 'Khả năng khảo sát', 'Đơn vị', 'KTC đang dùng: dưới', 'KTC đang dùng: trên', 'Quần thể', 'n dùng', 'Gián tiếp: dưới', 'CI90 dưới (thấp)', 'CI90 dưới (cao)', 'Gián tiếp: trên', 'CI90 trên (thấp)', 'CI90 trên (cao)', 'Phi tham số: dưới', 'Phi tham số: trên', 'n phi tham số', 'Kết luận giới hạn dưới', 'Kết luận giới hạn trên', '% dưới KTC', '% trên KTC']];
  const dat = [['Xét nghiệm', 'Sample ID', 'Thời gian', 'Giá trị', 'Dùng tính', 'Lý do loại']], boot = [['Xét nghiệm', 'Vòng', 'Giới hạn dưới', 'Giới hạn trên']];
  const par = [['Xét nghiệm', 'λ Box-Cox', 'Khoảng cắt (bách phân vị)', 'a (thang Box-Cox)', 'b (thang Box-Cox)', 'μ', 'σ', 'Tỷ lệ không bệnh lý', 'χ²', 'df', 'Khớp χ² (1%)', 'N', 'Số vòng bootstrap', 'Hạt giống ngẫu nhiên']];
  for (const r of results) {
    const i = r.ind, np = r.np;
    sum.push([r.assay, r.cls.t, unitOf(r.assay), limCell(r.info.lo), limCell(r.info.hi), RIS.mode === 'pair' && r.data.partner ? `Lọc theo ${r.data.partner} bình thường` : 'Tất cả mẫu BN', r.n,
      i ? r4(i.lo) : '', i ? r4(i.ciLo[0]) : '', i ? r4(i.ciLo[1]) : '', i ? r4(i.hi) : '', i ? r4(i.ciHi[0]) : '', i ? r4(i.ciHi[1]) : '', np ? r4(np.lo) : '', np ? r4(np.hi) : '', np ? np.n : '', r.vLo ? r.vLo.t : '', r.vHi ? r.vHi.t : '', r4(r.outLo), r4(r.outHi)]);
    r.data.used.forEach(x => dat.push([r.assay, x.sid, x.ts, r4(x.dose), 'Có', '']));
    r.data.excl.forEach(e => dat.push([r.assay, e.r.sid, e.r.ts, e.r.doseRaw, 'Không', e.why]));
    if (i) { i.bootLo.forEach((v, k) => boot.push([r.assay, k + 1, r4(v), r4(i.bootHi[k])])); par.push([r.assay, i.l, `P${r4(i.q1 * 100)} – P${r4(i.q2 * 100)}`, r4(i.a), r4(i.b), r4(i.m), r4(i.s), r4(i.P), r4(i.chi2), i.df, i.accepted ? 'Đạt' : 'Không đạt', i.N, i.B, 20251014]); }
  }
  return [{ name: 'KTC tóm tắt', rows: sum }, { name: 'KTC tham số', rows: par }, { name: 'KTC dữ liệu', rows: dat }, { name: 'KTC bootstrap', rows: boot },
    { name: 'KTC tài liệu', rows: [['Tài liệu tham khảo']].concat(RI_REFS.map(x => [x])) }];
}

/* ---------- Dựng báo cáo ---------- */
async function buildReport(onProg = () => {}) {
  const secs = Object.keys(RP_SECTIONS).filter(k => RP.secs.has(k));
  const data = periodData(RP.from, RP.to, RP.mask);
  const tpl = RP_TEMPLATES[RP.tpl] || RP_TEMPLATES.full;
  return withData(data, async () => {
    const parts = [], sheets = [];
    const period = `${RP.from || days(S.D)[0] || ''} → ${RP.to || days(S.D).at(-1) || ''}`;
    sheets.push({ name: 'Thông tin', rows: [['Mục', 'Nội dung'], ['Báo cáo', tpl.t], ['Đơn vị', LAB.org], ['Khoa/phòng', LAB.dept], ['Máy', LAB.instrument], ['Kỳ báo cáo', period], ['Người lập', LAB.author], ['Ngày tạo', new Date().toLocaleString('vi-VN')],
      ['Sample ID bệnh nhân', RP.mask ? 'Đã ẩn bớt' : 'Đầy đủ'], ['Số kết quả trong kỳ', S.D.length], ['File log', S.files.map(f => f.label || f.name).join(', ')], ['Phần mềm', 'LabLog Analyzer ' + APP_VERSION], ['Ghi chú', 'KTC đang dùng được suy ra từ cờ Above/BelowNormalRange trong log (trừ khi nhập tay). Đơn vị là suy đoán theo độ lớn nếu không nhập.']] });
    let no = 0;
    for (const k of secs) {
      no++; onProg(`Đang dựng: ${RP_SECTIONS[k]}…`); await new Promise(r => setTimeout(r, 20));
      let html = '';
      if (k === 'activity') { renderOverview(); html = snapshot($('#p-overview').innerHTML); sheets.push(...sheetsActivity()); }
      if (k === 'qc') { renderQC(); html = snapshot($('#p-qc').innerHTML); sheets.push(...sheetsQC()); }
      if (k === 'reagent') { renderReagent(); html = snapshot($('#p-reagent').innerHTML); sheets.push(...sheetsReagent()); }
      if (k === 'maint') { renderMaint(); html = snapshot($('#p-maint').innerHTML); sheets.push(...sheetsMaint()); }
      if (k === 'ops') {
        const M = S.M, has = M.has || {}, sub = [];
        if (has.log) sub.push(['Thời gian trả kết quả (TAT)', opsTAT()], ['Huỷ test và lỗi', opsErr()], ['Nhiệt độ và trạng thái máy', opsState()], ['Thuốc thử và vật tư', opsReag()]);
        sub.push(['Pha loãng', opsDil()]);
        if (has.lis) sub.push(['Giao tiếp LIS', opsLIS()]);
        html = (has.log || has.lis ? '' : '<div class="note">Dữ liệu chỉ có FinishedJobs: nạp file sao lưu .zip để có đủ phần vận hành.</div>') + sub.map(([t, h]) => `<h2 class="rp-h2">${esc(t)}</h2>` + snapshot(h, 30)).join('');
        sheets.push(...sheetsOps());
      }
      if (k === 'alerts') { renderAlerts(); html = snapshot($('#p-alerts').innerHTML, 400); sheets.push(...sheetsAlerts()); }
      if (k === 'dist') { renderLink(); html = `<div class="note">Điều kiện: ${esc(LK.conds.filter(c => c.assay).map(condText).join(' và ') || 'mọi mẫu')} · xét nghiệm đánh giá: <b>${esc(LK.target)}</b></div>` + snapshot($('#linkOut').innerHTML + $('#distOut').innerHTML); sheets.push(...sheetsDist()); }
      if (k === 'ri') {
        const list = riAssays(), results = [];
        for (let i = 0; i < list.length; i++) { onProg(`Khảo sát KTC: ${list[i]} (${i + 1}/${list.length})…`); await new Promise(r => setTimeout(r, 20)); results.push(riCompute(list[i])); }
        RIS.sel = ''; renderRI();
        const top = document.createElement('div'); top.innerHTML = $('#p-ri').innerHTML;
        const cards = top.querySelectorAll(':scope > .card');
        html = snapshot(cards[1] ? cards[1].outerHTML : '') + results.filter(r => r.ind).map(r => snapshot(riDetailHTML(r, true))).join('') + snapshot(cards[cards.length - 1] ? cards[cards.length - 1].outerHTML : '');
        html = `<div class="note">Quần thể tham chiếu: ${RIS.mode === 'pair' ? 'lọc theo xét nghiệm đi kèm bình thường (FT4/FT3 ↔ TSH)' : 'tất cả mẫu bệnh nhân'}; bootstrap ${RIS.boot} vòng. Log không có tuổi, giới tính, chẩn đoán; kết quả là sàng lọc, cần thẩm định trực tiếp trước khi thay đổi KTC.</div>` + html;
        sheets.push(...sheetsRI(results));
      }
      parts.push(`<section class="rp-sec${no > 1 ? ' rp-break' : ''}"><h1 class="rp-h">${no}. ${esc(RP_SECTIONS[k])}</h1>${html}</section>`);
    }
    if (RP.raw) sheets.push(...sheetsRaw());
    const head = `<header class="rp-head"><div class="rp-org"><b>${esc(LAB.org || 'Tên đơn vị')}</b><span>${esc(LAB.dept || 'Khoa / phòng xét nghiệm')}</span></div>
      <div class="rp-title"><h1>${esc(tpl.t)}</h1><div>Kỳ báo cáo: <b>${esc(period)}</b>${LAB.instrument ? ` · Máy: <b>${esc(LAB.instrument)}</b>` : ''}</div>
      <div class="rp-meta">Dữ liệu: ${esc(S.files.map(f => f.label || f.name).join(', '))} · ${S.D.length} kết quả · ${RP.mask ? 'Sample ID bệnh nhân đã được ẩn bớt' : 'Sample ID đầy đủ'} · tạo lúc ${new Date().toLocaleString('vi-VN')}</div></div></header>`;
    const sign = `<section class="rp-sign"><table><tr><th>Người lập</th><th>Người kiểm tra</th><th>Trưởng khoa / phụ trách</th></tr>
      <tr class="rp-sp"><td></td><td></td><td></td></tr><tr><td>${esc(LAB.author)}</td><td>${esc(LAB.reviewer)}</td><td>${esc(LAB.approver)}</td></tr></table>
      <div class="rp-meta">Báo cáo tạo bằng LabLog Analyzer ${APP_VERSION}. Số liệu tính từ file log FinishedJobs của máy; phần đánh giá mang tính hỗ trợ rà soát, không thay thế quy trình QC và quyết định chuyên môn của phòng xét nghiệm.</div></section>`;
    const ascii = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const fname = `${ascii(tpl.t).replace(/\s+/g, '-')}_${(RP.from || days(S.D)[0] || '').replace(/-/g, '')}-${(RP.to || days(S.D).at(-1) || '').replace(/-/g, '')}`;
    return { html: head + parts.join('') + sign, sheets, fname, title: tpl.t };
  });
}

/* ---------- Giao diện ---------- */
function monthsOf() { return [...new Set(S.D.map(r => r.day.slice(0, 7)))].sort(); }

function openReportDialog() {
  let dlg = document.getElementById('rpDlg');
  if (!dlg) { dlg = document.createElement('div'); dlg.id = 'rpDlg'; dlg.className = 'modal'; document.body.appendChild(dlg); }
  const dl = days(S.D); if (!RP.from && dl.length) RP.from = dl[0]; if (!RP.to && dl.length) RP.to = dl.at(-1);
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  const fld = (k, l, ph) => `<label>${l}<input type="text" data-lab="${k}" value="${esc(LAB[k] || '')}" placeholder="${esc(ph)}"></label>`;
  dlg.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="rpTitle">
    <div class="hd"><h2 id="rpTitle">Xuất báo cáo</h2><button class="btn" type="button" data-rp="close" aria-label="Đóng">Đóng</button></div>
    <div class="rp-grid">
      <div class="rp-col">
        <h3>Nội dung</h3>
        <label>Mẫu báo cáo<select id="rpTpl">${Object.entries(RP_TEMPLATES).map(([k, v]) => opt(k, v.t, RP.tpl)).join('')}</select></label>
        <div class="rp-checks">${Object.entries(RP_SECTIONS).map(([k, v]) => `<label class="chk"><input type="checkbox" data-sec="${k}" ${RP.secs.has(k) ? 'checked' : ''}> ${esc(v)}</label>`).join('')}</div>
        <h3>Kỳ báo cáo</h3>
        <div class="filters"><label>Tháng<select id="rpMonth">${opt('', 'Tuỳ chọn', '')}${monthsOf().map(m => opt(m, m.slice(5) + '/' + m.slice(0, 4), '')).join('')}${opt('all', 'Toàn bộ dữ liệu', '')}</select></label>
          <label>Từ ngày<input type="date" id="rpFrom" value="${esc(RP.from)}"></label><label>Đến ngày<input type="date" id="rpTo" value="${esc(RP.to)}"></label></div>
        <label class="chk"><input type="checkbox" id="rpMask" ${RP.mask ? 'checked' : ''}> Ẩn bớt Sample ID bệnh nhân (vd 2510***16)</label>
        <label class="chk"><input type="checkbox" id="rpRaw" ${RP.raw ? 'checked' : ''}> Kèm toàn bộ kết quả gốc (raw) trong file Excel</label>
        ${RP.secs.has('dist') ? `<div class="note">Phần phân bố dùng điều kiện đang chọn ở tab "Lọc theo Sample ID": ${esc(LK.conds.filter(c => c.assay).map(condText).join(' và ') || 'mọi mẫu')} → ${esc(LK.target || '')}.</div>` : ''}
        ${RP.secs.has('ri') ? `<div class="note">Phần khảo sát KTC dùng thiết lập ở tab "Khảo sát KTC" (quần thể, số vòng bootstrap); có thể mất vài giây đến vài chục giây.</div>` : ''}
      </div>
      <div class="rp-col">
        <h3>Thông tin đơn vị (in ở đầu và cuối báo cáo)</h3>
        <div class="rp-fields">${fld('org', 'Tên đơn vị', 'Bệnh viện …')}${fld('dept', 'Khoa / phòng', 'Khoa Xét nghiệm')}${fld('instrument', 'Máy', 'LIAISON XL – số máy …')}${fld('author', 'Người lập', 'Họ tên')}${fld('reviewer', 'Người kiểm tra', 'Họ tên')}${fld('approver', 'Trưởng khoa / phụ trách', 'Họ tên')}</div>
        <div class="note">Thông tin này được nhớ trên máy này.</div>
      </div>
    </div>
    <div class="rp-actions"><span class="note" id="rpProg"></span>
      <button class="btn" type="button" data-rp="csv">Tải CSV kết quả gốc</button>
      <button class="btn" type="button" data-rp="xlsx">Xuất Excel</button>
      <button class="btn primary" type="button" data-rp="preview">Xem trước & lưu PDF</button></div>
  </div>`;
  dlg.hidden = false;
  const q = s => dlg.querySelector(s);
  q('#rpTpl').onchange = e => { RP.tpl = e.target.value; RP.secs = new Set(RP_TEMPLATES[RP.tpl].s); openReportDialog(); };
  dlg.querySelectorAll('[data-sec]').forEach(c => c.onchange = () => { c.checked ? RP.secs.add(c.dataset.sec) : RP.secs.delete(c.dataset.sec); openReportDialog(); });
  q('#rpMonth').onchange = e => { const m = e.target.value; if (m === 'all') { RP.from = dl[0]; RP.to = dl.at(-1); } else if (m) { RP.from = m + '-01'; const d = new Date(+m.slice(0, 4), +m.slice(5), 0); RP.to = `${m}-${String(d.getDate()).padStart(2, '0')}`; } openReportDialog(); };
  q('#rpFrom').onchange = e => { RP.from = e.target.value; }; q('#rpTo').onchange = e => { RP.to = e.target.value; };
  q('#rpMask').onchange = e => { RP.mask = e.target.checked; }; q('#rpRaw').onchange = e => { RP.raw = e.target.checked; };
  dlg.querySelectorAll('[data-lab]').forEach(i => i.oninput = () => { LAB[i.dataset.lab] = i.value; saveLab(); });
  const prog = t => { const p = q('#rpProg'); if (p) p.textContent = t; };
  const busy = on => dlg.querySelectorAll('.rp-actions .btn').forEach(b => b.disabled = on);
  dlg.onclick = async e => {
    const b = e.target.closest('[data-rp]'); if (!b) { if (e.target === dlg) dlg.hidden = true; return; }
    const act = b.dataset.rp;
    if (act === 'close') { dlg.hidden = true; return; }
    if (!RP.secs.size && act !== 'csv') { prog('Chọn ít nhất một phần nội dung.'); return; }
    busy(true);
    try {
      if (act === 'csv') { const rep = await withData(periodData(RP.from, RP.to, RP.mask), async () => sheetsRaw()[0]); downloadBlob(csvBlob(rep.rows), `Ket-qua-goc_${RP.from}_${RP.to}.csv`); prog('Đã tạo file CSV.'); }
      else { const rep = await buildReport(prog); RP.last = rep;
        if (act === 'xlsx') { downloadBlob(xlsxBlob(rep.sheets), rep.fname + '.xlsx'); prog(`Đã tạo file Excel (${rep.sheets.length} sheet).`); }
        else { prog(''); dlg.hidden = true; showReport(rep); } }
    } catch (err) { console.error(err); prog('Không tạo được báo cáo: ' + err.message); }
    busy(false);
  };
}

function showReport(rep) {
  let v = document.getElementById('rpView');
  if (!v) { v = document.createElement('div'); v.id = 'rpView'; document.body.appendChild(v); }
  v.innerHTML = `<div class="rp-toolbar"><b>${esc(rep.title)}</b><span class="note">Xem trước bản in khổ A4</span><span style="flex:1"></span>
      <button class="btn" type="button" data-v="xlsx">Xuất Excel</button><button class="btn primary" type="button" data-v="pdf">Lưu PDF / In</button><button class="btn" type="button" data-v="close">Đóng</button></div>
    <div class="rp-paper"><div id="report" class="report">${rep.html}</div></div>`;
  v.hidden = false; document.body.classList.add('rp-open');
  v.onclick = async e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    if (b.dataset.v === 'close') { v.hidden = true; document.body.classList.remove('rp-open'); }
    if (b.dataset.v === 'xlsx') downloadBlob(xlsxBlob(rep.sheets), rep.fname + '.xlsx');
    if (b.dataset.v === 'pdf') {
      if (window.lablogDesktop && window.lablogDesktop.savePDF) { b.disabled = true; try { const r = await window.lablogDesktop.savePDF(rep.fname + '.pdf'); if (r) toast('Đã lưu ' + r); } finally { b.disabled = false; } }
      else window.print();
    }
  };
}
