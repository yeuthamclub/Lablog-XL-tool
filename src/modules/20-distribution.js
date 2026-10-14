/* ---------- Phân bố (biểu đồ chuông), nhóm lâm sàng, ma trận 9 ô, cặp trái chiều ---------- */

// Thống kê dùng chung
function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p, i = Math.floor(h);
  return sorted[i] + (h - i) * ((sorted[Math.min(i + 1, sorted.length - 1)]) - sorted[i]);
}
const normPdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
function normCdf(x) { // Abramowitz–Stegun 7.1.26 (sai số < 1,5e-7)
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

let DIST = { scale: {}, cell: null };
try { Object.assign(DIST.scale, JSON.parse(localStorage.getItem('lablog-scale') || '{}')); } catch (e) {}
const saveScale = () => { try { localStorage.setItem('lablog-scale', JSON.stringify(DIST.scale)); } catch (e) {} };

// Thang log hay tuyến tính cho một xét nghiệm (tự chọn nếu dữ liệu lệch phải mạnh)
function useLog(assay, vals) {
  if (DIST.scale[assay]) return DIST.scale[assay] === 'log';
  if (/^TSH/i.test(assay)) return true;
  const v = vals.filter(x => x > 0).sort((a, b) => a - b);
  if (v.length < 20 || v[0] <= 0) return false;
  return quantile(v, 0.975) / quantile(v, 0.5) > 5;
}

// Mốc chia nhóm lâm sàng mặc định
function defaultCuts(assay) {
  const lo = refLo(assay), hi = refHi(assay), u = unitOf(assay);
  if (/^TSH/i.test(assay)) return [0.1, lo, hi, 10];
  if (/^FT4/i.test(assay) && u === 'ng/dL') return [lo, hi, 2.5];
  if (/^FT4/i.test(assay) && u === 'pmol/L') return [lo, hi, 32];
  return [lo, hi];
}
function cutsOf(assay) {
  const s = (RR[assay] || {}).cuts;
  const raw = s ? String(s).split(/[;\s]+/).map(numOr) : defaultCuts(assay);
  return [...new Set(raw.filter(x => x !== null && Number.isFinite(x)))].sort((a, b) => a - b);
}
const valOf = r => r.qual === '<' ? r.dose * 0.999999 : r.qual === '>' ? r.dose * 1.000001 : r.dose;
function groupCounts(recs, cuts) {
  const g = Array(cuts.length + 1).fill(0);
  for (const r of recs) { const v = valOf(r); let i = 0; while (i < cuts.length && v >= cuts[i]) i++; g[i]++; }
  return g.map((n, i) => ({ label: i === 0 ? `< ${fmt(cuts[0], 4)}` : i === cuts.length ? `≥ ${fmt(cuts[i - 1], 4)}` : `${fmt(cuts[i - 1], 4)} – < ${fmt(cuts[i], 4)}`, n }));
}

function distStats(recs, log) {
  const ex = recs.filter(r => !r.qual && Number.isFinite(r.dose) && (!log || r.dose > 0)).map(r => r.dose).sort((a, b) => a - b);
  const all = recs.map(valOf).sort((a, b) => a - b);
  const tr = ex.map(v => log ? Math.log10(v) : v);
  const m = tr.length ? mean(tr) : NaN, s = sd(tr);
  return { n: recs.length, nExact: ex.length, cens: recs.length - ex.length, median: quantile(all, .5), p025: quantile(all, .025), p975: quantile(all, .975),
    mean: log ? 10 ** m : m, sd: s, gmean: log ? 10 ** m : NaN, tm: m, ts: s, ex };
}

// Trục log: các mốc 1-2-5
function logTicks(lo, hi) {
  const t = [];
  for (let e = Math.floor(lo) - 1; e <= Math.ceil(hi) + 1; e++) for (const m of [1, 2, 5]) { const v = Math.log10(m) + e; if (v >= lo - 1e-9 && v <= hi + 1e-9) t.push(v); }
  return t.length > 12 ? t.filter(v => Math.abs(v - Math.round(v)) < 1e-9) : t;
}
const tickLabel = (v, log) => { const x = log ? 10 ** v : v; return fmt(+x.toPrecision(3), 4); };

/* Biểu đồ chuông: histogram + đường cong chuẩn (trên thang đã biến đổi) + vùng KTC + trung vị, P2,5, P97,5 */
function bellChart(recs, assay, opt = {}) {
  const vals = recs.map(r => r.dose).filter(Number.isFinite);
  const log = opt.log ?? useLog(assay, vals);
  const st = distStats(recs, log);
  const W = opt.w || 640, H = opt.h || 260, pad = { l: 44, r: 14, t: 22, b: 34 };
  if (st.n < 3) return { svg: '<div class="empty">Chưa đủ dữ liệu để vẽ phân bố.</div>', st, log };
  const T = x => log ? Math.log10(Math.max(x, 1e-12)) : x;
  const tex = st.ex.map(T).sort((a, b) => a - b);
  let x0 = quantile(tex, 0.005), x1 = quantile(tex, 0.995);
  const lo = refLo(assay), hi = refHi(assay);
  for (const v of [lo, hi]) if (v !== null && (!log || v > 0)) { x0 = Math.min(x0, T(v)); x1 = Math.max(x1, T(v)); }
  const span = (x1 - x0) || 1; x0 -= span * 0.04; x1 += span * 0.04;
  const NB = opt.bins || 34, bw = (x1 - x0) / NB;
  const bins = Array(NB).fill(0); let cl = 0, ch = 0;
  for (const r of recs) {
    if (!Number.isFinite(r.dose)) continue;
    if (r.qual === '<') { cl++; continue; } if (r.qual === '>') { ch++; continue; }
    let i = Math.floor((T(r.dose) - x0) / bw); i = Math.max(0, Math.min(NB - 1, i)); bins[i]++;
  }
  const side = (cl || ch) ? 30 : 0;
  const pl = pad.l + (cl ? side : 0), pr = W - pad.r - (ch ? side : 0);
  const X = v => pl + (v - x0) / (x1 - x0) * (pr - pl);
  const curve = Number.isFinite(st.ts) && st.ts > 0 ? i => st.nExact * bw * normPdf(i, st.tm, st.ts) : null;
  let ymax = Math.max(1, ...bins, cl, ch);
  if (curve) ymax = Math.max(ymax, curve(st.tm));
  const yStep = niceStep(ymax), ytop = Math.ceil(ymax / yStep) * yStep;
  const Y = v => pad.t + (H - pad.t - pad.b) * (1 - v / ytop);
  const colOf = c => { const v = log ? 10 ** c : c; return lo !== null && v < lo ? 'var(--c7)' : hi !== null && v > hi ? 'var(--crit)' : 'var(--ok)'; };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:${W}px" role="img" aria-label="Phân bố ${esc(assay)}">`;
  for (let v = 0; v <= ytop; v += yStep) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="${v ? .5 : 1}"/><text x="${pad.l - 5}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`;
  if (lo !== null || hi !== null) {
    const a = lo !== null && (!log || lo > 0) ? X(T(lo)) : pl, b = hi !== null ? X(T(hi)) : pr;
    s += `<rect x="${a}" y="${pad.t}" width="${Math.max(0, b - a)}" height="${H - pad.t - pad.b}" fill="var(--accent-soft)" opacity=".55"><title>Vùng KTC ${esc(fmtRef(assay))}</title></rect>`;
    for (const [v, l] of [[lo, 'KTC'], [hi, 'KTC']]) if (v !== null && (!log || v > 0)) s += `<line x1="${X(T(v))}" x2="${X(T(v))}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--accent)" stroke-width="1.2"/><text x="${X(T(v))}" y="${pad.t - 6}" text-anchor="middle" style="fill:var(--accent)">${tickLabel(T(v), log)}</text>`;
  }
  bins.forEach((n, i) => { if (!n) return; const c = x0 + (i + .5) * bw;
    s += `<rect x="${X(x0 + i * bw) + .6}" y="${Y(n)}" width="${Math.max(1, X(x0 + (i + 1) * bw) - X(x0 + i * bw) - 1.2)}" height="${Y(0) - Y(n)}" fill="${colOf(c)}" opacity=".78"><title>${tickLabel(x0 + i * bw, log)} – ${tickLabel(x0 + (i + 1) * bw, log)}: ${n} mẫu</title></rect>`; });
  if (cl) s += `<rect x="${pad.l + 4}" y="${Y(cl)}" width="${side - 10}" height="${Y(0) - Y(cl)}" fill="var(--c7)" opacity=".5" stroke="var(--c7)" stroke-dasharray="3 2"><title>${cl} kết quả có dấu &lt; (dưới ngưỡng đo)</title></rect><text x="${pad.l + side / 2 - 1}" y="${H - pad.b + 14}" text-anchor="middle">&lt;LoD</text>`;
  if (ch) s += `<rect x="${pr + 6}" y="${Y(ch)}" width="${side - 10}" height="${Y(0) - Y(ch)}" fill="var(--crit)" opacity=".5" stroke="var(--crit)" stroke-dasharray="3 2"><title>${ch} kết quả có dấu &gt; (trên ngưỡng đo)</title></rect><text x="${pr + side / 2 + 1}" y="${H - pad.b + 14}" text-anchor="middle">&gt;max</text>`;
  if (curve) { const pts = []; for (let i = 0; i <= 120; i++) { const v = x0 + (x1 - x0) * i / 120; pts.push(`${X(v).toFixed(1)},${Y(Math.min(curve(v), ytop)).toFixed(1)}`); }
    s += `<polyline fill="none" stroke="var(--ink)" stroke-width="1.6" points="${pts.join(' ')}"><title>Đường cong chuẩn khớp dữ liệu${log ? ' (trên thang log)' : ''}</title></polyline>`; }
  for (const [v, l, da] of [[st.median, 'Trung vị', ''], [st.p025, 'P2,5', '3 3'], [st.p975, 'P97,5', '3 3']]) {
    if (!Number.isFinite(v) || (log && v <= 0)) continue; const xv = T(v); if (xv < x0 || xv > x1) continue;
    s += `<line x1="${X(xv)}" x2="${X(xv)}" y1="${pad.t + 8}" y2="${H - pad.b}" stroke="var(--c2)" stroke-dasharray="${da}" stroke-width="1.3"><title>${l}: ${fmt(v, 4)}</title></line><text x="${X(xv)}" y="${pad.t + 6}" text-anchor="middle" style="fill:var(--c2)">${l}</text>`;
  }
  for (const v of (log ? logTicks(x0, x1) : (() => { const st2 = niceStep(x1 - x0); const a = []; for (let v = Math.ceil(x0 / st2) * st2; v <= x1; v += st2) a.push(+v.toPrecision(10)); return a; })()))
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${H - pad.b}" y2="${H - pad.b + 4}" stroke="var(--muted)"/><text x="${X(v)}" y="${H - pad.b + 15}" text-anchor="middle">${tickLabel(v, log)}</text>`;
  s += `<text x="${(pl + pr) / 2}" y="${H - 4}" text-anchor="middle">${esc(assay)}${unitOf(assay) ? ' (' + esc(unitOf(assay)) + ')' : ''}${log ? ' · thang log' : ''}</text></svg>`;
  return { svg: s, st, log };
}

function groupTable(assay, recs) {
  const n = recs.length; if (!n) return '';
  const c3 = { low: 0, normal: 0, high: 0 }; for (const r of recs) c3[classify(r)]++;
  const g = groupCounts(recs, cutsOf(assay));
  const row = (lbl, k, cls) => `<tr><td>${cls ? `<span class="st-${cls}">${lbl}</span>` : lbl}</td><td class="num">${k}</td><td class="num">${fmt(k / n * 100, 1)}%</td><td style="width:40%"><div class="bar100" style="height:10px"><span style="width:${k / n * 100}%;background:${cls === 'low' ? 'var(--c7)' : cls === 'high' ? 'var(--crit)' : cls === 'normal' ? 'var(--ok)' : 'var(--accent)'}"></span></div></td></tr>`;
  return `<table><thead><tr><th>Nhóm</th><th class="num">Số mẫu</th><th class="num">Tỷ lệ</th><th></th></tr></thead><tbody>
    ${row('Dưới KTC', c3.low, 'low')}${row('Trong KTC', c3.normal, 'normal')}${row('Trên KTC', c3.high, 'high')}
    <tr><td colspan="4" class="cat" style="padding-top:10px">Nhóm theo mốc ${esc(cutsOf(assay).map(x => fmt(x, 4)).join(' · '))} ${esc(unitOf(assay))}</td></tr>
    ${g.map(x => row(esc(x.label), x.n, '')).join('')}</tbody></table>`;
}

function distCard(title, assay, recs, idPrefix) {
  const b = bellChart(recs, assay);
  const st = b.st;
  return `<div class="card"><div class="hd"><h2>${title}</h2>
      <div class="seg" role="group" aria-label="Thang trục">${['auto', 'log', 'lin'].map(k => `<button type="button" class="btn sm${(DIST.scale[assay] || 'auto') === k ? ' on' : ''}" data-scale="${esc(assay)}|${k}">${k === 'auto' ? 'Tự động' : k === 'log' ? 'Log' : 'Tuyến tính'}</button>`).join('')}</div></div>
    <div class="stats"><span>n <b>${st.n}</b></span><span>Trung vị <b>${fmt(st.median, 4)}</b></span><span>P2,5 – P97,5 <b>${fmt(st.p025, 4)} – ${fmt(st.p975, 4)}</b></span>${b.log ? `<span>TB hình học <b>${fmt(st.gmean, 4)}</b></span>` : `<span>TB ± SD <b>${fmt(st.mean, 4)} ± ${fmt(st.sd, 4)}</b></span>`}${st.cens ? `<span>Có dấu &lt;/&gt; <b>${st.cens}</b></span>` : ''}<span>KTC <b>${esc(fmtRef(assay))}</b></span></div>
    <div class="scroll">${b.svg}</div>
    ${groupTable(assay, recs)}
    <label class="cat" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">Mốc chia nhóm ${esc(assay)}:
      <input type="text" data-cuts="${esc(assay)}" value="${esc((RR[assay] || {}).cuts ?? cutsOf(assay).map(x => String(x)).join('; '))}" style="width:220px" aria-label="Mốc chia nhóm ${esc(assay)}">
      <button type="button" class="btn sm" data-cuts-reset="${esc(assay)}">Mặc định</button></label>
  </div>`;
}

/* ---------- Ma trận 9 ô ---------- */
const THYROID_HORMONE = /^(FT4|FT3|T4|T3|TT4|TT3)$/i;
function thyroidPair(a, b) { return (/^TSH/i.test(a) && THYROID_HORMONE.test(b)) || (/^TSH/i.test(b) && THYROID_HORMONE.test(a)); }
const CELL_NOTE = { // [trạng thái TSH][trạng thái hormon]
  high: { low: 'Gợi ý suy giáp nguyên phát', normal: 'Gợi ý suy giáp cận lâm sàng', high: 'Trái chiều – nên xem lại' },
  normal: { low: 'Hormon thấp, TSH bình thường', normal: 'Bình giáp', high: 'Hormon cao, TSH bình thường' },
  low: { low: 'Trái chiều – nên xem lại', normal: 'Gợi ý cường giáp cận lâm sàng', high: 'Gợi ý cường giáp nguyên phát' }
};
function pairData(A, B) {
  const M = sampleMap(), out = [];
  for (const [sid, o] of M) if (o[A] && o[B] && Number.isFinite(o[A].dose) && Number.isFinite(o[B].dose)) out.push({ sid, a: o[A], b: o[B], ca: classify(o[A]), cb: classify(o[B]) });
  return out;
}
function matrixCard(A, B) {
  const P = pairData(A, B);
  if (P.length < 5) return '';
  const thy = thyroidPair(A, B), tshIsA = /^TSH/i.test(A);
  const logA = useLog(A, P.map(p => p.a.dose)), logB = useLog(B, P.map(p => p.b.dose));
  const TA = v => logA ? Math.log10(Math.max(v, 1e-6)) : v, TB = v => logB ? Math.log10(Math.max(v, 1e-6)) : v;
  const xs = P.map(p => TA(p.a.dose)).sort((a, b) => a - b), ys = P.map(p => TB(p.b.dose)).sort((a, b) => a - b);
  const loA = refLo(A), hiA = refHi(A), loB = refLo(B), hiB = refHi(B);
  // Trục hiển thị 1% – 99% dữ liệu (cộng giới hạn KTC); điểm ngoài khung được dồn sát mép
  let x0 = quantile(xs, .01), x1 = quantile(xs, .99), y0 = quantile(ys, .01), y1 = quantile(ys, .99);
  for (const v of [loA, hiA]) if (v) { x0 = Math.min(x0, TA(v)); x1 = Math.max(x1, TA(v)); }
  for (const v of [loB, hiB]) if (v) { y0 = Math.min(y0, TB(v)); y1 = Math.max(y1, TB(v)); }
  const dx = (x1 - x0) || 1, dy = (y1 - y0) || 1; x0 -= dx * .05; x1 += dx * .05; y0 -= dy * .05; y1 += dy * .05;
  const W = 560, H = 440, pad = { l: 52, r: 16, t: 14, b: 40 };
  const X = v => pad.l + (Math.min(Math.max(v, x0), x1) - x0) / (x1 - x0) * (W - pad.l - pad.r);
  const Y = v => H - pad.b - (Math.min(Math.max(v, y0), y1) - y0) / (y1 - y0) * (H - pad.t - pad.b);
  const K = ['low', 'normal', 'high'], cnt = {}; for (const a of K) for (const b of K) cnt[a + b] = 0;
  for (const p of P) cnt[p.ca + p.cb]++;
  const disc = c => thy && ((c === 'highhigh') || (c === 'lowlow'));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:${W}px" role="img" aria-label="Ma trận ${esc(A)} × ${esc(B)}">`;
  const xb = [x0, loA ? TA(loA) : x0, hiA ? TA(hiA) : x1, x1], yb = [y0, loB ? TB(loB) : y0, hiB ? TB(hiB) : y1, y1];
  K.forEach((ka, i) => K.forEach((kb, j) => {
    const c = ka + kb, xa = X(xb[i]), xz = X(xb[i + 1]), ya = Y(yb[j + 1]), yz = Y(yb[j]);
    if (xz - xa < 1 || yz - ya < 1) return;
    s += `<rect x="${xa}" y="${ya}" width="${xz - xa}" height="${yz - ya}" fill="${disc(c) ? 'var(--warn-soft)' : c === 'normalnormal' ? 'var(--accent-soft)' : 'transparent'}" opacity=".7" data-cell="${c}" style="cursor:pointer"><title>${esc(A)} ${ST_SHORT[ka]} · ${esc(B)} ${ST_SHORT[kb]}: ${cnt[c]} mẫu</title></rect>`;
  }));
  for (const v of logA ? logTicks(x0, x1) : []) s += `<text x="${X(v)}" y="${H - pad.b + 15}" text-anchor="middle">${tickLabel(v, true)}</text>`;
  if (!logA) { const st2 = niceStep(x1 - x0); for (let v = Math.ceil(x0 / st2) * st2; v <= x1; v += st2) s += `<text x="${X(v)}" y="${H - pad.b + 15}" text-anchor="middle">${tickLabel(v, false)}</text>`; }
  for (const v of logB ? logTicks(y0, y1) : []) s += `<text x="${pad.l - 6}" y="${Y(v) + 3}" text-anchor="end">${tickLabel(v, true)}</text>`;
  if (!logB) { const st2 = niceStep(y1 - y0); for (let v = Math.ceil(y0 / st2) * st2; v <= y1; v += st2) s += `<text x="${pad.l - 6}" y="${Y(v) + 3}" text-anchor="end">${tickLabel(v, false)}</text>`; }
  s += `<rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="none" stroke="var(--line)"/>`;
  for (const v of [loA, hiA]) if (v) s += `<line x1="${X(TA(v))}" x2="${X(TA(v))}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--accent)" stroke-dasharray="4 3"/>`;
  for (const v of [loB, hiB]) if (v) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(TB(v))}" y2="${Y(TB(v))}" stroke="var(--accent)" stroke-dasharray="4 3"/>`;
  const step = P.length > 6000 ? Math.ceil(P.length / 6000) : 1;
  for (let i = 0; i < P.length; i += step) { const p = P[i];
    s += `<circle cx="${X(TA(p.a.dose)).toFixed(1)}" cy="${Y(TB(p.b.dose)).toFixed(1)}" r="1.9" fill="${disc(p.ca + p.cb) ? 'var(--warn)' : 'var(--ink)'}" opacity="${disc(p.ca + p.cb) ? .9 : .35}"/>`; }
  K.forEach((ka, i) => K.forEach((kb, j) => {
    const c = ka + kb, xa = X(xb[i]), xz = X(xb[i + 1]), ya = Y(yb[j + 1]), yz = Y(yb[j]);
    if (xz - xa < 74 || yz - ya < 24) return;
    s += `<text x="${(xa + xz) / 2}" y="${(ya + yz) / 2 + 4}" text-anchor="middle" style="fill:var(--ink);font-size:12px;font-weight:600;paint-order:stroke;stroke:var(--surface);stroke-width:3px">${cnt[c]} · ${fmt(cnt[c] / P.length * 100, 1)}%</text>`;
  }));
  s += `<text x="${(pad.l + W - pad.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(A)}${unitOf(A) ? ' (' + esc(unitOf(A)) + ')' : ''}${logA ? ' · log' : ''}</text>`;
  s += `<text transform="translate(12 ${(pad.t + H - pad.b) / 2}) rotate(-90)" text-anchor="middle">${esc(B)}${unitOf(B) ? ' (' + esc(unitOf(B)) + ')' : ''}${logB ? ' · log' : ''}</text></svg>`;
  const rows = [];
  for (const kb of [...K].reverse()) for (const ka of K) {
    const c = ka + kb; if (!cnt[c]) continue;
    const tsh = tshIsA ? ka : kb, hor = tshIsA ? kb : ka;
    rows.push(`<tr${disc(c) ? ' class="hl"' : ''}><td><button type="button" class="linkbtn" data-cellpick="${c}">${esc(A)} ${ST_SHORT[ka]} · ${esc(B)} ${ST_SHORT[kb]}</button></td><td class="num">${cnt[c]}</td><td class="num">${fmt(cnt[c] / P.length * 100, 1)}%</td>${thy ? `<td>${disc(c) ? '<span class="pill p-high">' : ''}${CELL_NOTE[tsh][hor]}${disc(c) ? '</span>' : ''}</td>` : ''}</tr>`);
  }
  const pick = DIST.cell && DIST.cell.k === A + '|' + B ? DIST.cell.c : null;
  const list = pick ? P.filter(p => p.ca + p.cb === pick) : [];
  const pi = pick ? K.flatMap(a => K.map(b => a + b)).indexOf(pick) : -1, pa = K[Math.floor(pi / 3)], pb = K[pi % 3];
  return `<div class="card" id="matrixCard"><div class="hd"><h2>Ma trận 9 ô: ${esc(A)} × ${esc(B)}</h2><span class="sub">${P.length} Sample ID có cả hai kết quả · đường nét đứt là giới hạn KTC · bấm vào ô để xem danh sách mẫu</span></div>
    <div class="grid2" style="align-items:start"><div class="scroll">${s}</div>
    <div class="scroll"><table><thead><tr><th>Ô</th><th class="num">Số mẫu</th><th class="num">Tỷ lệ</th>${thy ? '<th>Gợi ý (không thay chẩn đoán)</th>' : ''}</tr></thead><tbody>${rows.join('')}</tbody></table>
    ${thy ? `<div class="note">Ô tô vàng: TSH và hormon tuyến giáp cùng tăng hoặc cùng giảm. Kiểu này hiếm gặp về sinh lý; nên xem lại khả năng nhiễu xét nghiệm (kháng thể dị loại, biotin), nhầm mẫu, hoặc bệnh lý tuyến yên.</div>` : ''}</div></div>
    ${pick ? `<div class="hd"><h2>Danh sách mẫu: ${esc(A)} ${ST_SHORT[pa]} · ${esc(B)} ${ST_SHORT[pb]}</h2><span class="sub">${list.length} mẫu</span></div>` : ''}
    ${pick ? `<div class="tablebox" style="max-height:340px"><table><thead><tr><th>Sample ID</th><th>Ngày</th><th class="num">${esc(A)}</th><th class="num">${esc(B)}</th></tr></thead><tbody>${list.slice(0, 500).map(p => `<tr><td class="mono">${esc(p.sid)}</td><td class="mono">${p.b.ts.slice(0, 10)}</td><td class="num"><span class="st-${p.ca}">${esc(p.a.doseRaw)}</span></td><td class="num"><span class="st-${p.cb}">${esc(p.b.doseRaw)}</span></td></tr>`).join('')}</tbody></table></div>${list.length > 500 ? `<div class="note">Hiện 500/${list.length} mẫu.</div>` : ''}` : ''}
  </div>`;
}

function discordantList(A, B) {
  if (!thyroidPair(A, B)) return [];
  return pairData(A, B).filter(p => (p.ca === 'high' && p.cb === 'high') || (p.ca === 'low' && p.cb === 'low'));
}

function fillDist() {
  const out = document.getElementById('distOut'); if (!out) return;
  const { withT } = runLink();
  const T = LK.target;
  const main = withT.map(p => p.o[T]).filter(r => r && Number.isFinite(r.dose));
  const conds = LK.conds.filter(c => c.assay && c.state !== 'none');
  const A = conds.length ? conds[0].assay : null;
  const desc = conds.map(condText).join(' và ') || 'mọi mẫu';
  let html = '';
  const one = conds.length === 1 && conds[0].state === 'normal' && A && A !== T;
  if (one) {
    // So sánh hai chiều: A trong KTC → T, và T trong KTC → A
    const M = sampleMap(), rev = [];
    for (const [, o] of M) if (o[T] && o[A] && classify(o[T]) === 'normal' && Number.isFinite(o[A].dose)) rev.push(o[A]);
    html += `<div class="hd"><h2>Phân bố hai chiều</h2><button type="button" class="btn" id="distSwap">Đảo chiều: ${esc(T)} trong KTC → ${esc(A)}</button></div>
      <div class="grid2">${distCard(`${esc(T)} khi ${esc(A)} trong KTC`, T, main)}${distCard(`${esc(A)} khi ${esc(T)} trong KTC`, A, rev)}</div>`;
  } else {
    html += distCard(`Phân bố ${esc(T)} · ${esc(desc)}`, T, main);
  }
  if (A && A !== T) html += matrixCard(A, T);
  const dl = A && A !== T ? discordantList(A, T) : [];
  if (dl.length) html += `<div class="card"><div class="hd"><h2>Cặp kết quả trái chiều cần xem lại</h2><span class="sub">${dl.length} mẫu: ${esc(A)} và ${esc(T)} cùng tăng hoặc cùng giảm</span></div>
    <div class="tablebox" style="max-height:360px"><table><thead><tr><th>Sample ID</th><th>Thời gian</th><th class="num">${esc(A)}</th><th class="num">${esc(T)}</th><th>Kiểu</th><th>Lô ${esc(T)}</th></tr></thead><tbody>
    ${dl.map(p => `<tr><td class="mono">${esc(p.sid)}</td><td class="mono">${p.b.ts.slice(0, 16)}</td><td class="num"><span class="st-${p.ca}">${esc(p.a.doseRaw)}</span></td><td class="num"><span class="st-${p.cb}">${esc(p.b.doseRaw)}</span></td><td>${p.ca === 'high' ? 'Cùng tăng' : 'Cùng giảm'}</td><td class="mono">${esc(p.b.lot)}</td></tr>`).join('')}</tbody></table></div></div>`;
  out.innerHTML = html;
  out.querySelectorAll('[data-scale]').forEach(b => b.onclick = () => { const [a, k] = b.dataset.scale.split('|'); if (k === 'auto') delete DIST.scale[a]; else DIST.scale[a] = k; saveScale(); fillDist(); });
  out.querySelectorAll('[data-cuts]').forEach(el => el.addEventListener('change', e => { const a = e.target.dataset.cuts; RR[a] = { ...(RR[a] || {}), cuts: e.target.value }; saveRR(); fillDist(); }));
  out.querySelectorAll('[data-cuts-reset]').forEach(b => b.onclick = () => { const a = b.dataset.cutsReset; if (RR[a]) delete RR[a].cuts; saveRR(); fillDist(); });
  const sw = document.getElementById('distSwap');
  if (sw) sw.onclick = () => { LK.conds = [{ assay: T, state: 'normal', min: '', max: '' }]; LK.target = A; renderLink(); };
  out.querySelectorAll('[data-cell],[data-cellpick]').forEach(el => el.addEventListener('click', () => {
    DIST.cell = { k: A + '|' + T, c: el.dataset.cell || el.dataset.cellpick }; fillDist();
    const mc = document.getElementById('matrixCard'); if (mc && mc.scrollIntoView) mc.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }));
}
