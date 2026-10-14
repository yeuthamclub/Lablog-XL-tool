/* ---------- Tab "Khảo sát KTC" ---------- */

const RI_REFS = [
  'CLSI. Defining, Establishing, and Verifying Reference Intervals in the Clinical Laboratory; Approved Guideline – Third Edition. CLSI document EP28-A3c. Wayne, PA: Clinical and Laboratory Standards Institute; 2008 (tái bản có chỉnh sửa 2010).',
  'Jones GRD, Haeckel R, Loh TP, Sikaris K, Streichert T, Katayev A, Barth JH, Ozarda Y; IFCC Committee on Reference Intervals and Decision Limits (C-RIDL). Indirect methods for reference interval determination – review and recommendations. Clin Chem Lab Med. 2019;57(1):20–29. doi:10.1515/cclm-2018-0073',
  'Wosniok W, Haeckel R. A new indirect estimation of reference intervals: truncated minimum chi-square (TMC) approach. Clin Chem Lab Med. 2019;57(12):1933–1947. doi:10.1515/cclm-2018-1341',
  'Ammer T, Schützenmeister A, Prokosch HU, Rauh M, Rank CM, Zierk J. refineR: A novel algorithm for reference interval estimation from real-world data. Sci Rep. 2021;11:16023. doi:10.1038/s41598-021-95301-2',
  'Ichihara K, Boyd JC; IFCC C-RIDL. An appraisal of statistical procedures used in derivation of reference intervals. Clin Chem Lab Med. 2010;48(11):1537–1551. doi:10.1515/CCLM.2010.319',
  'Cohen AC. Estimating the mean and variance of normal populations from singly truncated and doubly truncated samples. Ann Math Stat. 1950;21(4):557–569.'
];

// Phân loại khả năng khảo sát KTC từ log (log không có tuổi, giới, chẩn đoán)
function riClass(assay) {
  if (/^(HBsAg|HBeAg|aHB|anti-?HB|HCV|HIV|HAV|HEV|Syph|TPHA|Toxo|Rub|CMV|HSV|EBV|VZV|COV|SARS|Chag|HTLV|Bor|Myco|Chlam|Q-?Fever)/i.test(assay) || /IgM|IgG$/i.test(assay))
    return { k: 'na', t: 'Không áp dụng', d: 'Xét nghiệm định tính / dùng ngưỡng cắt, không có khoảng tham chiếu.' };
  if (/^(f?PSA|tPSA|FSH|LH|PRL|Prolact|E2|Estrad|Testo|Prog|DHEA|SHBG|AMH|hCG|bhCG|Ferr|Inhib)/i.test(assay))
    return { k: 'lim', t: 'Hạn chế', d: 'KTC phụ thuộc giới tính, tuổi hoặc chu kỳ; log không có các thông tin này nên chỉ ước tính chung cho cả quần thể.' };
  if (/^(CEA|AFP|CA ?(15|125|19|72)|CYFRA|NSE|SCC|HE4|ProGRP|Calcit|TG$|Thyroglob)/i.test(assay))
    return { k: 'lim', t: 'Hạn chế', d: 'Dấu ấn ung thư: chủ yếu dùng giới hạn trên; quần thể bệnh viện có nhiều người bệnh nên ước tính gián tiếp dễ lệch.' };
  if (/^(ALDO|Ren|Cort|ACTH|GH|Insul|C-?Pep|PTH)/i.test(assay))
    return { k: 'lim', t: 'Hạn chế', d: 'Phụ thuộc tư thế, giờ lấy mẫu hoặc trạng thái đói; log không ghi điều kiện lấy mẫu.' };
  return { k: 'ok', t: 'Khảo sát được', d: '' };
}
const RI_PAIR = { FT4: 'TSH', FT3: 'TSH', T4: 'TSH', T3: 'TSH', TSH: 'FT4' };
function riPartner(assay) {
  const key = Object.keys(RI_PAIR).find(k => new RegExp('^' + k + '$', 'i').test(assay));
  if (!key) return null;
  const want = RI_PAIR[key], av = assays();
  return av.find(a => new RegExp('^' + want, 'i').test(a)) || null;
}

let RIS = { mode: 'pair', boot: 100, sel: '', res: new Map(), busy: false, ver: 0, verify: { assay: '', ids: '' } };

/* Dữ liệu dùng để ước tính: mẫu bệnh nhân, mỗi Sample ID một kết quả (mới nhất); bỏ kết quả có dấu < >.
   Chế độ 'pair': chỉ giữ mẫu có xét nghiệm đi kèm (vd TSH cho FT4) nằm trong KTC. */
function riData(assay, mode) {
  const M = new Map();
  for (const r of S.D) {
    if (r.cat !== 'patient' || !Number.isFinite(r.dose)) continue;
    if (!M.has(r.sid)) M.set(r.sid, {});
    const o = M.get(r.sid), cur = o[r.assay]; if (!cur || r.time >= cur.time) o[r.assay] = r;
  }
  const partner = mode === 'pair' ? riPartner(assay) : null;
  const used = [], excl = [];
  for (const [sid, o] of M) {
    const r = o[assay]; if (!r) continue;
    if (r.qual) { excl.push({ r, why: r.qual === '<' ? 'Dưới ngưỡng đo (có dấu <)' : 'Trên ngưỡng đo (có dấu >)' }); continue; }
    if (!(r.dose > 0)) { excl.push({ r, why: 'Giá trị ≤ 0' }); continue; }
    if (partner) {
      const p = o[partner];
      if (!p) { excl.push({ r, why: `Không làm ${partner}` }); continue; }
      if (classify(p) !== 'normal') { excl.push({ r, why: `${partner} ngoài KTC (${ST_SHORT[classify(p)]})` }); continue; }
    }
    used.push(r);
  }
  const dupes = S.D.filter(r => r.cat === 'patient' && r.assay === assay).length - used.length - excl.length;
  return { used, excl, partner, dupes: Math.max(0, dupes) };
}

function riCompute(assay) {
  const key = `${assay}|${RIS.mode}|${RIS.boot}|${RIS.ver}`;
  if (RIS.res.has(key)) return RIS.res.get(key);
  const cls = riClass(assay), info = refInfo(assay), d = riData(assay, RIS.mode);
  const x = d.used.map(r => r.dose);
  const out = { assay, key, cls, info, data: d, n: x.length };
  if (cls.k !== 'na' && x.length >= 40) {
    out.ind = estimateRI(x, { boot: RIS.boot });
    out.np = nonparamRI(x, out.ind ? out.ind.l : 0);
    const lo = refLo(assay), hi = refHi(assay);
    if (out.ind) {
      out.vLo = info.lo ? riVerdict(lo, out.ind.lo, out.ind.ciLo, x.length) : { k: 'na', t: 'KTC không có giới hạn dưới' };
      out.vHi = info.hi ? riVerdict(hi, out.ind.hi, out.ind.ciHi, x.length) : { k: 'na', t: 'KTC không có giới hạn trên' };
      if (info.lo && !info.lo.precise && !info.lo.manual) out.vLo = { k: 'na', t: `Chưa xác định chính xác giới hạn dưới đang dùng (${fmt(info.lo.a, 4)} – ${fmt(info.lo.b, 4)})` };
      if (info.hi && !info.hi.precise && !info.hi.manual) out.vHi = { k: 'na', t: `Chưa xác định chính xác giới hạn trên đang dùng (${fmt(info.hi.a, 4)} – ${fmt(info.hi.b, 4)})` };
    }
    out.outLo = lo != null ? x.filter(v => v < lo).length / x.length * 100 : null;
    out.outHi = hi != null ? x.filter(v => v > hi).length / x.length * 100 : null;
  }
  RIS.res.set(key, out);
  return out;
}

const vPill = v => !v ? '' : `<span class="pill ${v.k === 'ok' ? 'p-ok' : v.k === 'warn' ? 'p-high' : 'p-low'}">${esc(v.t)}</span>`;
const clsPill = c => `<span class="pill ${c.k === 'ok' ? 'p-ok' : c.k === 'lim' ? 'p-high' : 'p-low'}" title="${esc(c.d)}">${esc(c.t)}</span>`;
const f4 = v => fmt(v, 4);
const ciTxt = ci => ci && Number.isFinite(ci[0]) ? `${f4(ci[0])} – ${f4(ci[1])}` : '–';

function riAssays() { return assays().filter(a => S.D.some(r => r.assay === a && r.cat === 'patient' && Number.isFinite(r.dose) && !r.qual)); }

function renderRI() {
  const el = document.getElementById('p-ri'); if (!el) return;
  const list = riAssays();
  if (!RIS.sel || !list.includes(RIS.sel)) RIS.sel = list.find(a => riClass(a).k === 'ok') || list[0] || '';
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v == cur ? ' selected' : ''}>${esc(l)}</option>`;
  const rows = list.map(a => {
    const key = `${a}|${RIS.mode}|${RIS.boot}|${RIS.ver}`, r = RIS.res.get(key), c = riClass(a);
    return `<tr${a === RIS.sel ? ' class="sel"' : ''}><td><button type="button" class="linkbtn" data-ri-sel="${esc(a)}">${esc(a)}</button></td><td>${clsPill(c)}</td>
      <td class="mono">${esc(fmtRef(a))}</td>
      <td class="num">${r ? r.n : '…'}</td>
      <td class="num">${r && r.ind ? f4(r.ind.lo) + ' – ' + f4(r.ind.hi) : r ? '–' : '…'}</td>
      <td>${r ? vPill(r.vLo) : ''}</td><td>${r ? vPill(r.vHi) : ''}</td></tr>`;
  }).join('');
  el.innerHTML = `
  <div class="card"><div class="hd"><h2>Khảo sát mức phù hợp của khoảng tham chiếu</h2><span class="sub">Phương pháp gián tiếp từ kết quả bệnh nhân thường quy (IFCC C-RIDL 2019) và phi tham số (CLSI EP28-A3c)</span></div>
    <div class="filters">
      <label>Quần thể tham chiếu<select id="riMode">${opt('pair', 'Lọc theo xét nghiệm đi kèm bình thường (FT4↔TSH…)', RIS.mode)}${opt('all', 'Tất cả mẫu bệnh nhân', RIS.mode)}</select></label>
      <label>Số vòng bootstrap<select id="riBoot">${opt(100, '100 (nhanh)', RIS.boot)}${opt(200, '200', RIS.boot)}${opt(500, '500 (chậm, chính xác hơn)', RIS.boot)}</select></label>
      <button class="btn" type="button" id="riRun">Tính lại</button>
      <span class="note" id="riProg"></span>
    </div>
    <div class="note">Log máy không có tuổi, giới tính, chẩn đoán hay tình trạng thai kỳ, và quần thể là bệnh nhân bệnh viện. Kết quả dưới đây là <b>sàng lọc dấu hiệu KTC chưa phù hợp</b>; kết luận cuối cùng cần thẩm định trực tiếp trên người khỏe (mục cuối trang).</div>
  </div>
  <div class="card"><div class="hd"><h2>Tóm tắt theo xét nghiệm</h2><span class="sub">Bấm tên xét nghiệm để xem chi tiết</span></div>
    <div class="scroll"><table><thead><tr><th>Xét nghiệm</th><th>Khả năng khảo sát</th><th>KTC đang dùng (suy từ cờ)</th><th class="num">n dùng</th><th class="num">KTC ước tính (gián tiếp)</th><th>Giới hạn dưới</th><th>Giới hạn trên</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">Không có xét nghiệm định lượng.</td></tr>'}</tbody></table></div></div>
  <div id="riDetail" class="panel"></div>
  <div class="card" id="riVerify"></div>
  <div class="card"><div class="hd"><h2>Phương pháp</h2></div>
    <ol class="steps">
      <li><b>KTC đang dùng</b> được suy ra từ cờ Above/BelowNormalRange của máy: giới hạn nằm giữa kết quả không cờ lớn nhất và kết quả có cờ nhỏ nhất (với giới hạn trên), lấy số tròn gọn nhất trong khoảng đó.</li>
      <li><b>Dữ liệu:</b> mẫu bệnh nhân, mỗi Sample ID một kết quả (lần chạy mới nhất), bỏ kết quả có dấu &lt; / &gt;. Chế độ "lọc theo xét nghiệm đi kèm": FT4/FT3 chỉ lấy mẫu có TSH trong KTC và ngược lại.</li>
      <li><b>Ước tính gián tiếp</b> (theo hướng TMC/refineR): dữ liệu được biến đổi Box-Cox (λ = 0 … 1); với mỗi khoảng cắt quanh phần lõi, phân bố chuẩn cắt cụt được khớp bằng hợp lý cực đại (Cohen 1950); chọn bộ λ – khoảng cắt có điểm tốt nhất theo độ khớp χ², không vượt dữ liệu ở hai đuôi và độ phủ dữ liệu. KTC = biến đổi ngược của μ ± 1,96σ.</li>
      <li><b>Khoảng tin cậy 90%</b> cho mỗi giới hạn bằng bootstrap (chạy lại việc chọn mô hình ở mỗi vòng).</li>
      <li><b>Phi tham số (EP28):</b> loại ngoại lai bằng quy tắc Tukey trên thang Box-Cox, bách phân vị 2,5 và 97,5 theo hạng, khoảng tin cậy 90% theo hạng; cần n ≥ 120.</li>
      <li><b>Kết luận:</b> giới hạn đang dùng nằm trong khoảng tin cậy 90% của giá trị ước tính gián tiếp → "Phù hợp"; nằm ngoài → "Cần xem xét" (kèm % chênh lệch).</li>
      <li><b>Kiểm chứng thuật toán</b> trên 6 kịch bản dữ liệu mô phỏng đã biết KTC thật (n = 300 – 5000, 0 – 30% mẫu bệnh lý): sai số trung bình 4,7%; khoảng tin cậy 90% chứa giá trị thật ở 81% trường hợp (hơi hẹp hơn danh nghĩa). Sai số lớn hơn khi mẫu bệnh lý chồng lấn nhiều với người khỏe.</li>
    </ol>
    <div class="hd"><h2>Tài liệu tham khảo</h2></div>
    <ol class="refs">${RI_REFS.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
  </div>`;
  el.querySelectorAll('[data-ri-sel]').forEach(b => b.onclick = () => { RIS.sel = b.dataset.riSel; renderRI(); fillRIDetail(); document.getElementById('riDetail').scrollIntoView?.({ block: 'start', behavior: 'smooth' }); });
  document.getElementById('riMode').onchange = e => { RIS.mode = e.target.value; renderRI(); runRIQueue(); };
  document.getElementById('riBoot').onchange = e => { RIS.boot = +e.target.value; renderRI(); runRIQueue(); };
  document.getElementById('riRun').onclick = () => { RIS.ver++; RIS.res.clear(); renderRI(); runRIQueue(); };
  fillRIDetail(); fillRIVerify();
}

// Tính lần lượt từng xét nghiệm, nhường cho giao diện giữa các lần tính
function runRIQueue() {
  if (RIS.busy) return; const list = riAssays().filter(a => !RIS.res.has(`${a}|${RIS.mode}|${RIS.boot}|${RIS.ver}`));
  if (!list.length) return;
  RIS.busy = true; let i = 0;
  const step = () => {
    const a = list[i]; const p = document.getElementById('riProg'); if (p) p.textContent = `Đang tính ${a} (${i + 1}/${list.length})…`;
    setTimeout(() => {
      try { riCompute(a); } catch (e) { console.error(e); }
      i++;
      if (i < list.length) step(); else { RIS.busy = false; renderRI(); const p2 = document.getElementById('riProg'); if (p2) p2.textContent = 'Đã tính xong.'; }
    }, 30);
  };
  step();
}

/* Biểu đồ: histogram dữ liệu dùng tính + đường mô hình "không bệnh lý" + KTC đang dùng (vùng) + KTC ước tính (vạch) */
function riChart(res, W = 700, H = 280) {
  const { assay, ind } = res, x = res.data.used.map(r => r.dose).filter(v => v > 0).sort((a, b) => a - b);
  if (x.length < 10) return '<div class="empty">Không đủ dữ liệu.</div>';
  const log = useLog(assay, x), T = v => log ? Math.log10(v) : v, Ti = u => log ? 10 ** u : u;
  const lo = refLo(assay), hi = refHi(assay);
  let x0 = T(quantile(x, .005)), x1 = T(quantile(x, .995));
  for (const v of [lo, hi, ind && ind.lo, ind && ind.hi]) if (v > 0) { x0 = Math.min(x0, T(v)); x1 = Math.max(x1, T(v)); }
  const sp = x1 - x0 || 1; x0 -= sp * .04; x1 += sp * .04;
  const NB = 40, bw = (x1 - x0) / NB, bins = Array(NB).fill(0);
  for (const v of x) { let i = Math.floor((T(v) - x0) / bw); bins[Math.max(0, Math.min(NB - 1, i))]++; }
  const model = ind ? bins.map((_, i) => { const a = Ti(x0 + i * bw), b = Ti(x0 + (i + 1) * bw);
    return ind.P * ind.N * (normCdf((bc(Math.max(b, 1e-12), ind.l) - ind.m) / ind.s) - normCdf((bc(Math.max(a, 1e-12), ind.l) - ind.m) / ind.s)); }) : [];
  const pad = { l: 44, r: 14, t: 24, b: 36 }, ymax = Math.max(1, ...bins, ...model), ys = niceStep(ymax), yt = Math.ceil(ymax / ys) * ys;
  const X = u => pad.l + (u - x0) / (x1 - x0) * (W - pad.l - pad.r), Y = v => pad.t + (H - pad.t - pad.b) * (1 - v / yt);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:${W}px" role="img" aria-label="Phân bố ${esc(assay)} và KTC ước tính">`;
  for (let v = 0; v <= yt; v += ys) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="${v ? .5 : 1}"/><text x="${pad.l - 5}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`;
  if (lo != null || hi != null) { const a = lo > 0 ? X(T(lo)) : pad.l, b = hi > 0 ? X(T(hi)) : W - pad.r;
    s += `<rect x="${a}" y="${pad.t}" width="${Math.max(0, b - a)}" height="${H - pad.t - pad.b}" fill="var(--accent-soft)" opacity=".6"><title>KTC đang dùng ${esc(fmtRef(assay))}</title></rect>`; }
  bins.forEach((n, i) => { if (n) s += `<rect x="${X(x0 + i * bw) + .5}" y="${Y(n)}" width="${Math.max(1, X(x0 + (i + 1) * bw) - X(x0 + i * bw) - 1)}" height="${Y(0) - Y(n)}" fill="var(--muted)" opacity=".45"><title>${tickLabel(x0 + i * bw, log)} – ${tickLabel(x0 + (i + 1) * bw, log)}: ${n}</title></rect>`; });
  if (model.length) s += `<polyline fill="none" stroke="var(--c3)" stroke-width="2" points="${model.map((v, i) => `${X(x0 + (i + .5) * bw).toFixed(1)},${Y(Math.min(v, yt)).toFixed(1)}`).join(' ')}"><title>Mô hình phân bố "không bệnh lý" (ước tính ${fmt(ind.P * 100, 0)}% dữ liệu)</title></polyline>`;
  for (const v of [lo, hi]) if (v > 0) s += `<line x1="${X(T(v))}" x2="${X(T(v))}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--accent)" stroke-width="1.5"/><text x="${X(T(v))}" y="${pad.t - 8}" text-anchor="middle" style="fill:var(--accent)">${f4(v)}</text>`;
  if (ind) for (const [v, ci] of [[ind.lo, ind.ciLo], [ind.hi, ind.ciHi]]) { if (!(v > 0)) continue;
    if (ci && ci[0] > 0) s += `<rect x="${X(T(ci[0]))}" y="${pad.t + 12}" width="${Math.max(1, X(T(ci[1])) - X(T(ci[0])))}" height="${H - pad.t - pad.b - 12}" fill="var(--c2)" opacity=".12"/>`;
    s += `<line x1="${X(T(v))}" x2="${X(T(v))}" y1="${pad.t + 12}" y2="${H - pad.b}" stroke="var(--c2)" stroke-width="1.8" stroke-dasharray="5 3"/><text x="${X(T(v))}" y="${pad.t + 8}" text-anchor="middle" style="fill:var(--c2)">${f4(v)}</text>`; }
  for (const v of (log ? logTicks(x0, x1) : (() => { const st = niceStep(x1 - x0), a = []; for (let v = Math.ceil(x0 / st) * st; v <= x1; v += st) a.push(+v.toPrecision(10)); return a; })()))
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${H - pad.b}" y2="${H - pad.b + 4}" stroke="var(--muted)"/><text x="${X(v)}" y="${H - pad.b + 15}" text-anchor="middle">${tickLabel(v, log)}</text>`;
  s += `<text x="${(pad.l + W - pad.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(assay)}${unitOf(assay) ? ' (' + esc(unitOf(assay)) + ')' : ''}${log ? ' · thang log' : ''}</text></svg>`;
  return s;
}

function riDetailHTML(r, forReport) {
  const { assay, ind, np, info, data } = r, c = r.cls;
  const exCount = {}; for (const e of data.excl) exCount[e.why] = (exCount[e.why] || 0) + 1;
  const lim = (x) => x ? (x.manual ? `${f4(x.value)} (nhập tay)` : `${f4(x.value)} <span class="cat">(nằm trong ${f4(x.a)} – ${f4(x.b)}; ${x.nFlag} mẫu có cờ${x.conflicts ? `, ${x.conflicts} mẫu mâu thuẫn` : ''})</span>`) : '–';
  return `<div class="card ri-detail"><div class="hd"><h2>${esc(assay)} <span class="sub">· ${esc(unitOf(assay))}${info.unitGuess && unitOf(assay) ? ' (đơn vị suy đoán)' : ''}</span></h2>${clsPill(c)}</div>
    ${c.d ? `<div class="note">${esc(c.d)}</div>` : ''}
    ${r.n < 40 || !ind ? `<div class="empty">Chỉ có ${r.n} kết quả dùng được – chưa đủ để ước tính (cần ít nhất 120 theo EP28; thuật toán gián tiếp cần ≥ 40 để chạy).</div>` : `
    <div class="legend"><span><i style="background:var(--accent-soft);border:1px solid var(--accent)"></i>KTC đang dùng</span><span><i style="background:var(--c2)"></i>KTC ước tính (vạch đứt) và khoảng tin cậy 90% (vùng nhạt)</span><span><i style="background:var(--c3)"></i>Mô hình phân bố không bệnh lý</span><span><i style="background:var(--muted)"></i>Dữ liệu</span></div>
    <div class="scroll">${riChart(r)}</div>
    <div class="scroll"><table><thead><tr><th></th><th class="num">Giới hạn dưới</th><th class="num">KTC 90%</th><th class="num">Giới hạn trên</th><th class="num">KTC 90%</th></tr></thead><tbody>
      <tr><td>KTC đang dùng (suy từ cờ)</td><td class="num" colspan="2">${lim(info.lo)}</td><td class="num" colspan="2">${lim(info.hi)}</td></tr>
      <tr><td><b>Ước tính gián tiếp</b> (n = ${ind.N})</td><td class="num"><b>${f4(ind.lo)}</b></td><td class="num">${ciTxt(ind.ciLo)}</td><td class="num"><b>${f4(ind.hi)}</b></td><td class="num">${ciTxt(ind.ciHi)}</td></tr>
      ${np ? `<tr><td>Phi tham số EP28 (n = ${np.n}${np.nOut ? `, loại ${np.nOut} ngoại lai` : ''})${np.enough ? '' : ' – <span class="cat">n &lt; 120</span>'}</td><td class="num">${f4(np.lo)}</td><td class="num">${ciTxt(np.ciLo)}</td><td class="num">${f4(np.hi)}</td><td class="num">${ciTxt(np.ciHi)}</td></tr>` : ''}
      <tr><td>Kết luận</td><td colspan="2">${vPill(r.vLo)}</td><td colspan="2">${vPill(r.vHi)}</td></tr>
      <tr><td>Tỷ lệ dữ liệu ngoài KTC đang dùng</td><td colspan="2" class="num">${r.outLo != null ? fmt(r.outLo, 1) + '%' : '–'} <span class="cat">(kỳ vọng ≈ 2,5% nếu quần thể khỏe)</span></td><td colspan="2" class="num">${r.outHi != null ? fmt(r.outHi, 1) + '%' : '–'}</td></tr>
    </tbody></table></div>
    <div class="stats"><span>λ Box-Cox <b>${ind.l}</b></span><span>Khoảng cắt <b>P${fmt(ind.q1 * 100, 1)} – P${fmt(ind.q2 * 100, 1)}</b></span><span>Tỷ lệ "không bệnh lý" ước tính <b>${fmt(Math.min(ind.P, 1) * 100, 0)}%</b></span><span>χ²/df <b>${fmt(ind.chi2 / ind.df, 2)}</b>${ind.accepted ? '' : ' <span class="pill p-high">khớp kém</span>'}</span><span>Bootstrap <b>${ind.B} vòng</b></span></div>`}
    <div class="note">Dữ liệu: ${data.used.length} kết quả dùng tính${data.partner && RIS.mode === 'pair' ? ` (chỉ mẫu có ${esc(data.partner)} trong KTC)` : ''}${data.dupes ? `; ${data.dupes} kết quả chạy lặp cùng Sample ID chỉ lấy lần mới nhất` : ''}${Object.keys(exCount).length ? '; loại: ' + Object.entries(exCount).map(([k, v]) => `${esc(k)} ${v}`).join(', ') : ''}.</div>
  </div>`;
}

function fillRIDetail() {
  const el = document.getElementById('riDetail'); if (!el) return;
  if (!RIS.sel) { el.innerHTML = ''; return; }
  const key = `${RIS.sel}|${RIS.mode}|${RIS.boot}|${RIS.ver}`, r = RIS.res.get(key);
  if (!r) { el.innerHTML = `<div class="card"><div class="empty">Đang tính ${esc(RIS.sel)}…</div></div>`; return; }
  el.innerHTML = riDetailHTML(r);
}

/* Thẩm định trực tiếp theo EP28: 20 người khỏe; đạt nếu ≤ 2/20 (10%) nằm ngoài KTC */
function riVerifyResult(assay, idsText) {
  const tokens = String(idsText).split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  const M = sampleMap(), rows = [];
  for (const t of tokens) {
    const o = M.get(t);
    if (o && o[assay]) rows.push({ id: t, r: o[assay], v: o[assay].dose, st: classify(o[assay]) });
    else { const v = numOr(t); if (v !== null && !/^\d{4,}$/.test(t)) rows.push({ id: '(giá trị nhập)', v, st: classifyValue(assay, v) }); else rows.push({ id: t, missing: true }); }
  }
  const valid = rows.filter(x => !x.missing), out = valid.filter(x => x.st !== 'normal').length;
  let verdict = null;
  if (valid.length >= 20) verdict = out <= Math.floor(valid.length * 0.1) ? { k: 'ok', t: `Đạt: ${out}/${valid.length} ngoài KTC (≤ 10%)` } : { k: 'warn', t: `Không đạt: ${out}/${valid.length} ngoài KTC (> 10%). Theo EP28: lấy thêm 20 mẫu khác; nếu vẫn > 2/20 thì cần xem xét lại KTC.` };
  return { rows, valid, out, verdict };
}
function classifyValue(assay, v) { const lo = refLo(assay), hi = refHi(assay); return lo != null && v < lo ? 'low' : hi != null && v > hi ? 'high' : 'normal'; }

function fillRIVerify() {
  const el = document.getElementById('riVerify'); if (!el) return;
  const list = riAssays(); if (!RIS.verify.assay || !list.includes(RIS.verify.assay)) RIS.verify.assay = RIS.sel || list[0] || '';
  const A = RIS.verify.assay, res = RIS.verify.ids.trim() ? riVerifyResult(A, RIS.verify.ids) : null;
  el.innerHTML = `<div class="hd"><h2>Thẩm định trực tiếp 20 mẫu (CLSI EP28-A3c)</h2><span class="sub">Chạy xét nghiệm cho 20 người khỏe, rồi dán Sample ID (hoặc giá trị) vào đây</span></div>
    <div class="filters"><label>Xét nghiệm<select id="rvA">${list.map(a => `<option${a === A ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
      <label style="flex:1;min-width:240px">Sample ID hoặc giá trị (cách nhau bằng dấu phẩy, khoảng trắng hoặc xuống dòng)<textarea id="rvIds" rows="3" style="width:100%;font:inherit;font-size:.86rem;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink)">${esc(RIS.verify.ids)}</textarea></label></div>
    <div class="note">KTC đang dùng: <b>${esc(fmtRef(A))}</b>. Tiêu chí: đạt khi không quá 2/20 kết quả (10%) nằm ngoài KTC; nếu không đạt, thử lại với 20 mẫu khác.</div>
    ${res ? `<div>${res.verdict ? vPill(res.verdict) : `<span class="pill p-low">Mới có ${res.valid.length}/20 kết quả hợp lệ</span>`}</div>
      <div class="tablebox" style="max-height:300px"><table><thead><tr><th>#</th><th>Sample ID</th><th class="num">Kết quả</th><th>Đánh giá</th></tr></thead><tbody>${res.rows.map((x, i) => `<tr><td class="num">${i + 1}</td><td class="mono">${esc(x.id)}</td><td class="num">${x.missing ? '<span class="cat">không tìm thấy</span>' : `<span class="st-${x.st}">${esc(x.r ? x.r.doseRaw : f4(x.v))}</span>`}</td><td>${x.missing ? '' : ST_SHORT[x.st]}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  document.getElementById('rvA').onchange = e => { RIS.verify.assay = e.target.value; fillRIVerify(); };
  document.getElementById('rvIds').onchange = e => { RIS.verify.ids = e.target.value; fillRIVerify(); };
}

// Mở tab thì mới tính (tốn vài giây với dữ liệu lớn)
function riOnShow() { renderRI(); runRIQueue(); }
