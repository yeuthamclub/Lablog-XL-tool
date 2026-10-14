/* ---------- Theo dõi chất lượng bằng kết quả bệnh nhân (PBRTQC) ----------
   Trung vị kết quả bệnh nhân theo ngày cho từng xét nghiệm; đánh dấu ngày đổi lô thuốc thử,
   hiệu chuẩn mới, hộp mới. So sánh trung vị 7 ngày trước và sau mỗi lần đổi lô / hiệu chuẩn
   (kiểm định Mann–Whitney). Trung vị bệnh nhân còn phụ thuộc cơ cấu bệnh nhân từng ngày,
   nên đây là tín hiệu cần xem xét, không phải kết luận. */

const PB = { window: 7, minN: 20, minDay: 5, thr: 10 };

function mannWhitney(a, b) {
  const n1 = a.length, n2 = b.length; if (n1 < 3 || n2 < 3) return { z: NaN, p: NaN };
  const all = a.map(v => [v, 0]).concat(b.map(v => [v, 1])).sort((x, y) => x[0] - y[0]);
  const ranks = new Array(all.length); let tie = 0;
  for (let i = 0; i < all.length;) { let j = i; while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++; const r = (i + j) / 2 + 1, t = j - i + 1; tie += t ** 3 - t; for (let k = i; k <= j; k++) ranks[k] = r; i = j + 1; }
  let R1 = 0; all.forEach((x, i) => { if (x[1] === 0) R1 += ranks[i]; });
  const U = R1 - n1 * (n1 + 1) / 2, mu = n1 * n2 / 2, N = n1 + n2;
  const sig = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tie / (N * (N - 1))));
  const z = sig > 0 ? (U - mu) / sig : 0;
  return { z, p: 2 * (1 - normCdf(Math.abs(z))) };
}

function pbEvents(assay) {
  const recs = S.D.filter(r => r.assay === assay && r.cat !== 'clean').sort((a, b) => a.time - b.time);
  const ev = []; let p = null;
  for (const r of recs) {
    if (p) {
      if (r.lot !== p.lot) ev.push({ t: r.time, day: r.day, type: 'lot', txt: `Đổi lô thuốc thử ${p.lot} → ${r.lot}` });
      else if (r.serial !== p.serial) ev.push({ t: r.time, day: r.day, type: 'serial', txt: `Hộp mới (serial ${p.serial} → ${r.serial})` });
      if (r.calId && p.calId && r.calId !== p.calId) ev.push({ t: r.time, day: r.day, type: 'cal', txt: `Hiệu chuẩn mới (${p.calId} → ${r.calId})` });
    }
    p = r;
  }
  // Lần chạy chất chuẩn ($…$) cũng là hiệu chuẩn
  const cal = S.D.filter(r => r.assay === assay && r.cat === 'calibrator').sort((a, b) => a.time - b.time);
  let last = null; for (const r of cal) { if (!last || r.time - last > 3600e3) ev.push({ t: r.time, day: r.day, type: 'cal', txt: `Chạy chất chuẩn ${r.sid.replace(/\$[AB]$/, '')}` }); last = r.time; }
  return ev.sort((a, b) => a.t - b.t);
}

function pbData(assay) {
  const pts = S.D.filter(r => r.assay === assay && r.cat === 'patient' && !r.qual && Number.isFinite(r.dose));
  const byDay = {}; for (const r of pts) (byDay[r.day] ||= []).push(r.dose);
  const daysL = Object.keys(byDay).sort().map(d => { const v = byDay[d].sort((a, b) => a - b); return { day: d, n: v.length, med: quantile(v, .5), q1: quantile(v, .25), q3: quantile(v, .75) }; });
  const ev = pbEvents(assay);
  const cmp = ev.filter(e => e.type !== 'serial').map(e => {
    const before = pts.filter(r => r.time < e.t && r.time >= e.t - PB.window * 864e5).map(r => r.dose);
    const after = pts.filter(r => r.time >= e.t && r.time < +e.t + PB.window * 864e5).map(r => r.dose);
    const mb = quantile(before.sort((a, b) => a - b), .5), ma = quantile(after.sort((a, b) => a - b), .5);
    const d = (ma - mb) / mb * 100, mw = mannWhitney(before, after);
    const st = before.length < PB.minN || after.length < PB.minN ? { k: 'few', t: 'Ít dữ liệu' }
      : Math.abs(d) > PB.thr && mw.p < 0.05 ? { k: 'warn', t: `Cần xem xét (${d > 0 ? 'tăng' : 'giảm'} ${fmt(Math.abs(d), 1)}%)` } : { k: 'ok', t: 'Không thay đổi đáng kể' };
    return { ...e, nb: before.length, na: after.length, mb, ma, d, p: mw.p, st };
  });
  return { assay, days: daysL, ev, cmp, n: pts.length };
}

function pbChart(D, W = 720, H = 220) {
  const pts = D.days.filter(d => d.n >= PB.minDay); if (pts.length < 2) return '<div class="empty">Chưa đủ ngày có từ 5 kết quả trở lên.</div>';
  const log = useLog(D.assay, pts.map(p => p.med)), T = v => log ? Math.log10(Math.max(v, 1e-9)) : v;
  const t0 = +new Date(D.days[0].day + 'T00:00:00'), t1 = +new Date(D.days[D.days.length - 1].day + 'T23:59:59');
  let y0 = Math.min(...pts.map(p => T(p.q1))), y1 = Math.max(...pts.map(p => T(p.q3)));
  const sp = y1 - y0 || 1; y0 -= sp * .1; y1 += sp * .1;
  const pad = { l: 50, r: 12, t: 16, b: 26 };
  const X = t => pad.l + (t - t0) / Math.max(1, t1 - t0) * (W - pad.l - pad.r), Y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - y0) / (y1 - y0));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:${W}px" role="img" aria-label="Trung vị bệnh nhân theo ngày ${esc(D.assay)}">`;
  const ticks = log ? logTicks(y0, y1) : (() => { const st = niceStep(y1 - y0), a = []; for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) a.push(+v.toPrecision(10)); return a; })();
  for (const v of ticks) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width=".5"/><text x="${pad.l - 5}" y="${Y(v) + 3}" text-anchor="end">${tickLabel(v, log)}</text>`;
  for (const e of D.ev) { const x = X(+e.t); if (x < pad.l || x > W - pad.r) continue;
    const c = e.type === 'lot' ? 'var(--crit)' : e.type === 'cal' ? 'var(--c3)' : 'var(--line)';
    s += `<line x1="${x}" x2="${x}" y1="${pad.t}" y2="${H - pad.b}" stroke="${c}" stroke-width="${e.type === 'serial' ? 1 : 1.6}" stroke-dasharray="${e.type === 'serial' ? '2 3' : '5 3'}"><title>${esc(e.day)}: ${esc(e.txt)}</title></line>`; }
  s += `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${X(+new Date(p.day + 'T12:00:00')).toFixed(1)} ${Y(T(p.q3)).toFixed(1)}`).join(' ')} ${pts.slice().reverse().map(p => `L${X(+new Date(p.day + 'T12:00:00')).toFixed(1)} ${Y(T(p.q1)).toFixed(1)}`).join(' ')} Z" fill="var(--accent-soft)" opacity=".7"><title>Khoảng tứ phân vị</title></path>`;
  s += `<polyline fill="none" stroke="var(--accent)" stroke-width="1.6" points="${pts.map(p => `${X(+new Date(p.day + 'T12:00:00')).toFixed(1)},${Y(T(p.med)).toFixed(1)}`).join(' ')}"/>`;
  for (const p of pts) s += `<circle cx="${X(+new Date(p.day + 'T12:00:00')).toFixed(1)}" cy="${Y(T(p.med)).toFixed(1)}" r="${Math.min(5, 1.8 + Math.sqrt(p.n) / 4)}" fill="var(--accent)"><title>${p.day}: trung vị ${fmt(p.med, 4)} (n = ${p.n})</title></circle>`;
  const nd = Math.round((t1 - t0) / 864e5), every = Math.max(1, Math.ceil(nd / 10));
  for (let i = 0; i <= nd; i += every) { const t = t0 + i * 864e5 + 432e5, d = new Date(t); if (X(t) > W - pad.r - 14) continue; s += `<text x="${X(t)}" y="${H - 8}" text-anchor="middle">${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</text>`; }
  return s + '</svg>';
}

function pbCard(D) {
  const rows = D.cmp.map(c => `<tr><td class="mono">${c.day}</td><td>${esc(c.txt)}</td><td class="num">${fmt(c.mb, 4)} <span class="cat">(${c.nb})</span></td><td class="num">${fmt(c.ma, 4)} <span class="cat">(${c.na})</span></td><td class="num">${Number.isFinite(c.d) ? (c.d > 0 ? '+' : '') + fmt(c.d, 1) + '%' : '–'}</td><td class="num">${Number.isFinite(c.p) ? (c.p < 0.001 ? '< 0,001' : fmt(c.p, 3)) : '–'}</td><td><span class="pill ${c.st.k === 'warn' ? 'p-high' : c.st.k === 'ok' ? 'p-ok' : 'p-low'}">${esc(c.st.t)}</span></td></tr>`).join('');
  return `<div class="card"><div class="hd"><h2>${esc(D.assay)} <span class="sub">· trung vị kết quả bệnh nhân theo ngày (${D.n} kết quả)</span></h2></div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Trung vị ngày (chấm to = nhiều mẫu)</span><span><i style="background:var(--accent-soft)"></i>Tứ phân vị 25–75%</span><span><i style="background:var(--crit)"></i>Đổi lô</span><span><i style="background:var(--c3)"></i>Hiệu chuẩn</span><span><i style="background:var(--line)"></i>Hộp mới</span></div>
    <div class="scroll">${pbChart(D)}</div>
    ${rows ? `<div class="scroll"><table><thead><tr><th>Ngày</th><th>Sự kiện</th><th class="num">Trung vị 7 ngày trước (n)</th><th class="num">7 ngày sau (n)</th><th class="num">Chênh lệch</th><th class="num">p (Mann–Whitney)</th><th>Đánh giá</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="note">Không có lần đổi lô hay hiệu chuẩn trong khoảng thời gian của log.</div>'}
  </div>`;
}

function pbAssays() { return assays().filter(a => S.D.filter(r => r.assay === a && r.cat === 'patient' && !r.qual && Number.isFinite(r.dose)).length >= 60); }

function fillPBRTQC() {
  const el = document.getElementById('pbrtqc'); if (!el) return;
  const list = (QCV.assay ? [QCV.assay] : pbAssays()).filter(a => pbAssays().includes(a));
  el.innerHTML = `<div class="hd"><h2>Theo dõi bằng kết quả bệnh nhân</h2><span class="sub">Trung vị bệnh nhân theo ngày và so sánh trước/sau đổi lô, hiệu chuẩn. Chênh &gt; ${PB.thr}% và p &lt; 0,05 (mỗi phía ≥ ${PB.minN} mẫu) được đánh dấu cần xem xét. Trung vị còn phụ thuộc cơ cấu bệnh nhân từng ngày.</span></div>
    ${list.length ? list.map(a => pbCard(pbData(a))).join('') : '<div class="empty">Cần ít nhất 60 kết quả bệnh nhân cho một xét nghiệm.</div>'}`;
}
