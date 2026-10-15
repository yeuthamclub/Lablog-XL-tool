/* ---------- Vận hành máy: tính toán ----------
   Nối kết quả (FinishedJobs) với nhật ký máy (LogFile), pha loãng (DilutionLog) và LIS (C2R*.TRC)
   theo Sample ID, xét nghiệm và mã công việc (StartCycle = JobID). */

const OPS = { target: 60, assay: '', from: '', to: '', sub: 'tat', sid: '', cache: null };
try { const o = JSON.parse(localStorage.getItem('lablog-ops') || '{}'); if (o.target > 0) OPS.target = +o.target; } catch (e) { }
const saveOPS = () => { try { localStorage.setItem('lablog-ops', JSON.stringify({ target: OPS.target })); } catch (e) { } };

const p2 = n => String(n).padStart(2, '0');
const dStr = t => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const tStr = t => { const d = new Date(t); return `${dStr(t)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const sStr = t => { const d = new Date(t); return `${dStr(t)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const minFmt = m => !Number.isFinite(m) ? '–' : Math.abs(m) < 1 ? fmt(m * 60, 0) + ' giây' : Math.abs(m) < 120 ? fmt(m, m < 10 ? 1 : 0) + ' ph' : fmt(m / 60, 1) + ' giờ';
const qOf = (arr, p) => { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? quantile(a, p) : NaN; };
const medOf = arr => qOf(arr, .5);
function lowT(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m + 1; else hi = m; } return lo; }
function inWin(arr, t0, t1) { const out = []; for (let i = lowT(arr, t0); i < arr.length && arr[i].t <= t1; i++) out.push(arr[i]); return out; }
function groupBy(arr, kf) { const m = new Map(); for (const e of arr) { const k = kf(e); let a = m.get(k); if (!a) m.set(k, a = []); a.push(e); } return m; }

/* Mã xét nghiệm LIS ↔ tên xét nghiệm trên máy, và đơn vị LIS gửi kèm kết quả */
let LISMAP = {}, LISU = {};
function buildLisUnits() {
  LISMAP = {}; LISU = {};
  const M = S.M; if (!M || !M.lisR.length) return;
  const bySid = groupBy(S.D.filter(r => r.cat === 'patient'), r => r.sid);
  const cnt = {}, ucnt = {};
  for (const e of M.lisR) {
    const L = bySid.get(e.sid); if (!L || !Number.isFinite(e.rt)) continue;
    const r = L.find(r => Math.abs(+r.time - e.rt) <= 2000); if (!r) continue;
    e.assay = r.assay;
    ((cnt[e.test] ||= {})[r.assay] = (cnt[e.test][r.assay] || 0) + 1);
    if (e.unit) ((ucnt[r.assay] ||= {})[e.unit] = (ucnt[r.assay][e.unit] || 0) + 1);
  }
  for (const t in cnt) LISMAP[t] = Object.entries(cnt[t]).sort((a, b) => b[1] - a[1])[0][0];
  for (const a in ucnt) LISU[a] = Object.entries(ucnt[a]).sort((a, b) => b[1] - a[1])[0][0];
  for (const e of M.lisR) if (!e.assay && LISMAP[e.test]) e.assay = LISMAP[e.test];
  for (const e of M.lisO) e.assay = LISMAP[e.test] || e.test;
}

/* Phân loại lý do huỷ */
const ABORT_VI = {
  'Clot in Sample Probe': 'Cục đông trong kim hút mẫu', 'Sample not present': 'Không có mẫu', 'Not enough Liquid': 'Không đủ thể tích', 'Clot detected': 'Phát hiện cục đông',
  'Mechanical Error': 'Lỗi cơ khí', 'No Reagent': 'Hết thuốc thử', 'Reagent Integral not present': 'Không có hộp thuốc thử (Integral)', 'Starter Reagent depleted': 'Hết Starter',
  'Reagent Integrity Error': 'Lỗi toàn vẹn thuốc thử', 'First Starter Shot': 'Lần bắn Starter đầu', 'Integrity Error': 'Lỗi toàn vẹn'
};
function abortCat(reason) {
  if (/Clot|Sample not present|Not enough Liquid/i.test(reason)) return 'Mẫu';
  if (/Reagent|Starter|Integral|Integrity/i.test(reason)) return 'Thuốc thử';
  if (/Mechanical/i.test(reason)) return 'Cơ khí';
  return 'Khác';
}
const ABORT_CAT_COLOR = { 'Mẫu': 'var(--c2)', 'Thuốc thử': 'var(--c3)', 'Cơ khí': 'var(--crit)', 'Khác': 'var(--line)' };
const viReason = r => ABORT_VI[r] || r;

const MAINT_VI = { 'Månadsunderhåll': 'Bảo trì tháng', 'Veckounderhåll': 'Bảo trì tuần', 'Weekly Maintenance': 'Bảo trì tuần', 'Monthly Maintenance': 'Bảo trì tháng', 'Bakgrund': 'Đo nền (Background)', 'Background': 'Đo nền (Background)', 'BGW LCL LCR': 'BGW + Light Check (hằng ngày)', 'WasherPrime': 'Mồi bộ rửa (Washer Prime)' };
const maintVi = t => MAINT_VI[t] ? `${MAINT_VI[t]} <span class="cat">(${esc(t)})</span>` : esc(t);
function maintFreq(task) {
  if (/month|månad|monat|mensuel/i.test(task)) return 'month';
  if (/week|vecko|woche|hebdo/i.test(task)) return 'week';
  if (/BGW|LCL|LCR|daily|daglig|täglich|background|bakgrund/i.test(task)) return 'day';
  return 'other';
}

const STATE_GROUP = s => /Active/.test(s) ? 'run' : s === 'Ready' ? 'ready' : s === 'Maintenance' ? 'maint' : s === 'Standby' ? 'standby' : 'down';
const STATE_LABEL = { run: 'Đang chạy mẫu', ready: 'Sẵn sàng (chờ)', maint: 'Bảo trì', standby: 'Standby', down: 'Dừng / khởi động' };
const STATE_COLOR = { run: 'var(--accent)', ready: 'var(--c4)', maint: 'var(--c3)', standby: 'var(--line)', down: 'var(--crit)' };

/* Sự kiện máy dùng làm mốc trên các biểu đồ thời gian và tra cứu quanh một thời điểm */
const EVT = {
  maint: ['var(--c3)', 'Bảo trì'], temp: ['var(--warn)', 'Nhiệt độ ngoài khoảng'], halt: ['var(--crit)', 'Máy dừng (Halted)'],
  lot: ['var(--c2)', 'Đổi lô thuốc thử'], cal: ['var(--c4)', 'Hiệu chuẩn'], lis: ['var(--c7)', 'LIS không phản hồi'], abort: ['var(--c5)', 'Huỷ test'], kit: ['var(--c6)', 'Nạp hộp thuốc thử']
};
function machEvents(t0, t1, o = {}) {
  const M = S.M, ev = [], types = o.types || ['maint', 'temp', 'halt', 'lot', 'cal'];
  if (!M) return ev;
  if (types.includes('maint')) for (const e of inWin(M.maint, t0, t1)) if (!e.step || e.st === 'fail') ev.push({ t: e.t, type: 'maint', txt: `${MAINT_VI[e.task] || e.task}${e.step ? ` – bước ${e.step} ${e.stepName}` : ''}: ${e.st === 'ok' ? 'hoàn tất' : e.st === 'fail' ? 'LỖI' : 'huỷ'}`, bad: e.st !== 'ok' });
  if (types.includes('temp')) for (const e of tempEpisodes()) if (e.t0 >= t0 && e.t0 <= t1 && (!e.startup || o.all)) ev.push({ t: e.t0, type: 'temp', txt: `${e.part} ngoài khoảng (${fmt(e.vmin, 1)}${e.vmax !== e.vmin ? '–' + fmt(e.vmax, 1) : ''} °C${Number.isFinite(e.dur) ? ', ' + minFmt(e.dur) : ''})${e.startup ? ' lúc khởi động' : ''}`, bad: !e.startup });
  if (types.includes('halt')) for (const e of inWin(M.states, t0, t1)) if (e.to === 'Halted' && !/Not Initialized|Initializing/.test(e.from)) ev.push({ t: e.t, type: 'halt', txt: `Máy chuyển sang Halted (từ ${e.from})`, bad: true });
  if (types.includes('lis')) for (const e of inWin(M.lisTo, t0, t1)) ev.push({ t: e.t, type: 'lis', txt: `LIS không trả y lệnh cho mẫu ${e.sid} sau ${e.sec} giây` });
  if (types.includes('abort')) for (const e of inWin(M.aborts, t0, t1)) if (!o.assay || e.assay === o.assay) ev.push({ t: e.t, type: 'abort', txt: `Huỷ ${e.assay} mẫu ${e.sid}: ${viReason(e.reason)}`, bad: true });
  if (types.includes('kit')) { const km = kitAssayMap(), seen = new Set(); for (const e of inWin(M.integ, t0, t1)) { const k = e.lot + '|' + e.kit, a = km.get(k); if ((o.assay && a !== o.assay) || seen.has(k)) continue; seen.add(k); ev.push({ t: e.t, type: 'kit', txt: `Hộp ${a || '?'} lô ${e.lot}/kit ${e.kit} (làn ${e.lane}, còn ${e.det} test)` }); } }
  if ((types.includes('lot') || types.includes('cal')) && o.assay) for (const e of pbEvents(o.assay)) if (+e.t >= t0 && +e.t <= t1 && types.includes(e.type)) ev.push({ t: +e.t, type: e.type, txt: e.txt });
  return ev.sort((a, b) => a.t - b.t);
}

/* Hộp kit (Integral) ↔ xét nghiệm: lấy từ FinishedJobs (Integral Lot + Serial), bổ sung từ dòng "Calibration for Integral in lane … (ASSAY)" */
let KITMAP = null;
function kitAssayMap() {
  if (KITMAP && KITMAP.ver === S) return KITMAP.m;
  const m = new Map();
  for (const r of S.D) if (r.lot && r.serial && r.cat !== 'clean') m.set(r.lot + '|' + r.serial, r.assay);
  const M = S.M; if (M) {
    for (const e of M.integ) { const k = e.lot + '|' + e.kit; if (m.has(k)) continue;
      const c = inWin(M.calExp, e.t - 3000, e.t + 3000).find(c => c.lane === e.lane); if (c) m.set(k, c.assay); }
    // cùng lô thì cùng xét nghiệm
    const byLot = new Map(); for (const [k, a] of m) byLot.set(k.split('|')[0], a);
    for (const e of M.integ) { const k = e.lot + '|' + e.kit; if (!m.has(k) && byLot.has(e.lot)) m.set(k, byLot.get(e.lot)); }
  }
  KITMAP = { ver: S, m }; return m;
}

/* Hành trình từng test bệnh nhân: nạp ống → hỏi LIS → nhận y lệnh → hút mẫu → kết quả → gửi LIS */
function opsJobs() {
  if (OPS.cache && OPS.cache.S === S) return OPS.cache;
  const M = S.M;
  const tubes = groupBy(M.tubes, e => e.sid), toBy = groupBy(M.lisTo, e => e.sid), ordBy = groupBy(M.lisO, e => e.sid), sentBy = groupBy(M.lisR, e => e.sid);
  const qBy = new Map(); for (const e of M.lisQ) for (const s of e.sids) { let a = qBy.get(s); if (!a) qBy.set(s, a = []); a.push(e); }
  const aspBy = new Map(M.asp.map(e => [e.job, e])), dilBy = new Map(M.dil.map(e => [e.job, e]));
  const abBy = groupBy(M.aborts, e => e.sid + '|' + e.assay), failBy = groupBy(M.fails, e => e.sid + '|' + e.assay);
  const badStates = M.states.filter(e => /Halted|Maintenance|Not Initialized/.test(e.to));
  const pat = S.D.filter(r => r.cat === 'patient');
  const seen = new Set(), first = new Map(), cyclesBy = new Map(), jobs = [];
  for (const r of pat) { const k = r.sid + '|' + r.assay; let s = cyclesBy.get(k); if (!s) cyclesBy.set(k, s = new Set()); s.add(r.cycle); }
  for (const r of pat) {
    const key = r.sid + '|' + r.assay + '|' + r.cycle; if (seen.has(key)) continue; seen.add(key);
    const t = +r.time, cyc = +r.cycle, sa = r.sid + '|' + r.assay;
    let asp = aspBy.get(cyc); if (asp && asp.sid !== r.sid) asp = null;
    const aspT = asp ? asp.t : t;
    const TL = tubes.get(r.sid) || [];
    let load = null; for (let i = TL.length - 1; i >= 0; i--) if (TL[i].t <= aspT + 1000) { if (aspT - TL[i].t < 864e5) load = TL[i]; break; }
    const prev = first.get(sa), rerun = cyclesBy.get(sa).size > 1, isRerun = !!prev;
    const t0 = prev && prev.load ? prev.load.t : load ? load.t : NaN;
    const j = { r, sid: r.sid, assay: r.assay, t, day: r.day, cyc, asp, load, t0, rerun, isRerun };
    if (load) {
      const qa = qBy.get(r.sid) || []; j.q = qa.find(e => e.t >= load.t - 2000 && e.t <= aspT);
      const oa = ordBy.get(r.sid) || []; j.ord = j.q ? oa.find(e => e.t >= j.q.t && e.t - j.q.t < 600e3) : null;
      j.to = (toBy.get(r.sid) || []).find(e => e.t >= load.t && e.t <= aspT + 60e3);
      j.bad = badStates.filter(e => e.t >= t0 && e.t <= t);
      j.temp = inWin(M.temps, t0, t).filter(e => e.out);
    }
    const sl = sentBy.get(r.sid) || []; j.sent = sl.find(e => Number.isFinite(e.rt) && Math.abs(e.rt - t) <= 2000);
    j.dil = dilBy.get(cyc) || (r.dil > 1 ? { f: r.dil, fromFJ: true } : null);
    j.ab = (abBy.get(sa) || []).filter(e => e.t <= t && e.t >= (Number.isFinite(t0) ? t0 : t - 864e5) - 60e3);
    j.fail = (failBy.get(sa) || []).filter(e => e.t <= t && e.t >= (Number.isFinite(t0) ? t0 : t - 864e5) - 60e3);
    j.tat = Number.isFinite(t0) ? (t - t0) / 60e3 : NaN;
    j.wait = load && asp ? (asp.t - load.t) / 60e3 : NaN;
    j.run = asp ? (t - asp.t) / 60e3 : NaN;
    j.lisResp = j.q && j.ord ? (j.ord.t - j.q.t) / 1e3 : NaN;
    j.lisSend = j.sent ? (j.sent.t - t) / 60e3 : NaN;
    j.hour = Number.isFinite(t0) ? new Date(t0).getHours() : r.hour;
    j.wd = new Date(Number.isFinite(t0) ? t0 : t).getDay();
    if (!prev) first.set(sa, j);
    jobs.push(j);
  }
  // thời gian chờ hút "bình thường" theo xét nghiệm, để nhận ra mẫu chờ lâu
  const waitMed = {}; for (const [a, L] of groupBy(jobs, j => j.assay)) waitMed[a] = medOf(L.map(j => j.wait));
  for (const j of jobs) j.reasons = jobReasons(j, waitMed[j.assay]);
  OPS.cache = { S, jobs, waitMed };
  return OPS.cache;
}

function jobReasons(j, wm) {
  const R = [];
  if (j.isRerun) R.push({ k: 'rerun', t: 'Chạy lại' });
  for (const a of j.ab) R.push({ k: 'abort', t: 'Huỷ: ' + viReason(a.reason) });
  if (!j.ab.length) for (const f of j.fail) R.push({ k: 'abort', t: 'Hút lỗi: ' + viReason(f.reason) });
  if (j.dil) R.push({ k: 'dil', t: `Pha loãng 1:${fmt(j.dil.f, 2)}` });
  if (j.to) R.push({ k: 'lis', t: `LIS không trả y lệnh trong ${j.to.sec} giây` });
  else if (Number.isFinite(j.lisResp) && j.lisResp > 30) R.push({ k: 'lis', t: `LIS trả y lệnh chậm (${fmt(j.lisResp, 0)} giây)` });
  if (Number.isFinite(j.wait) && j.wait > Math.max(30, 2 * (wm || 0))) R.push({ k: 'wait', t: `Chờ hút mẫu ${minFmt(j.wait)}` });
  if (j.bad && j.bad.length) R.push({ k: 'halt', t: [...new Set(j.bad.map(e => e.to === 'Halted' ? 'Máy dừng' : e.to === 'Maintenance' ? 'Bảo trì' : 'Khởi động lại'))].join(', ') + ' trong lúc chờ' });
  if (j.temp && j.temp.length) R.push({ k: 'temp', t: 'Báo nhiệt độ ngoài khoảng' });
  return R;
}

function opsFilter(jobs) {
  return jobs.filter(j => (!OPS.assay || j.assay === OPS.assay) && (!OPS.from || j.day >= OPS.from) && (!OPS.to || j.day <= OPS.to));
}
const opsInRange = t => { const d = dStr(t); return (!OPS.from || d >= OPS.from) && (!OPS.to || d <= OPS.to); };
const opsArr = arr => arr.filter(e => opsInRange(e.t));

/* Các khoảng nhiệt độ ngoài khoảng (out → in), đánh dấu khoảng xảy ra lúc máy khởi động */
function tempEpisodes() {
  const M = S.M, eps = [], open = {};
  const starts = M.states.filter(e => /Initializ|Resuming/.test(e.to)).map(e => e.t);
  const isStartup = t => starts.some(s => t >= s - 60e3 && t - s < 45 * 60e3);
  const reag = p => /thuốc thử/.test(p);
  for (const e of M.temps) {
    const key = reag(e.part) ? 'reag' : e.part;
    if (e.out) { if (!open[key]) open[key] = { part: e.part, t0: e.t, vmin: e.v, vmax: e.v, n: 1 }; else { const o = open[key]; o.n++; if (Number.isFinite(e.v)) { o.vmin = Math.min(o.vmin, e.v); o.vmax = Math.max(o.vmax, e.v); } if (!reag(o.part) || o.part === e.part) { } else o.part = 'Khoang thuốc thử'; } }
    else if (open[key]) { const o = open[key]; o.t1 = e.t; o.vEnd = e.v; o.dur = (o.t1 - o.t0) / 60e3; o.startup = isStartup(o.t0); eps.push(o); delete open[key]; }
  }
  for (const k in open) { const o = open[k]; o.t1 = NaN; o.dur = NaN; o.startup = isStartup(o.t0); eps.push(o); }
  return eps.sort((a, b) => a.t0 - b.t0);
}

/* Giờ theo trạng thái máy mỗi ngày */
function stateHours() {
  const st = S.M.states, days = {};
  for (let i = 0; i < st.length; i++) {
    const a = st[i].t, b = i + 1 < st.length ? st[i + 1].t : a;
    if (b - a > 36 * 3600e3) continue; // khoảng trống giữa 2 file log
    const g = STATE_GROUP(st[i].to);
    let x = a;
    while (x < b) { const d = new Date(x); d.setHours(24, 0, 0, 0); const y = Math.min(b, +d); const k = dStr(x); (days[k] ||= { run: 0, ready: 0, maint: 0, standby: 0, down: 0 })[g] += (y - x) / 3600e3; x = y; }
  }
  return days;
}

/* Biểu đồ chuỗi thời gian có mốc sự kiện máy */
function tsChart(series, o = {}) {
  const W = o.W || 720, H = o.H || 220, pad = { l: 52, r: 12, t: 14, b: 26 };
  const all = series.flatMap(s => s.pts); if (!all.length) return '<div class="empty">Chưa có dữ liệu.</div>';
  let t0 = o.t0 ?? Math.min(...all.map(p => p.t)), t1 = o.t1 ?? Math.max(...all.map(p => p.t));
  if (t1 - t0 < 864e5) { t0 -= 432e5; t1 += 432e5; }
  const vs = all.map(p => p.v).concat((o.hlines || []).map(h => h.v)).filter(Number.isFinite);
  let y0 = o.y0 ?? Math.min(...vs), y1 = o.y1 ?? Math.max(...vs); const sp = (y1 - y0) || Math.abs(y1) || 1; if (o.y0 == null) y0 -= sp * .08; y1 += sp * .08; if (o.zero) y0 = Math.min(0, y0);
  const X = t => pad.l + (t - t0) / Math.max(1, t1 - t0) * (W - pad.l - pad.r), Y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - y0) / ((y1 - y0) || 1));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:480px;max-width:${W}px" role="img" aria-label="${esc(o.label || 'Biểu đồ theo thời gian')}">`;
  const st = niceStep(y1 - y0 || 1); for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width=".5"/><text x="${pad.l - 5}" y="${Y(v) + 3}" text-anchor="end">${(o.yfmt || (x => fmt(x, 2)))(+v.toPrecision(10))}</text>`;
  for (const e of o.events || []) { const x = X(e.t); if (x < pad.l || x > W - pad.r) continue; s += `<line x1="${x}" x2="${x}" y1="${pad.t}" y2="${H - pad.b}" stroke="${EVT[e.type] ? EVT[e.type][0] : 'var(--line)'}" stroke-width="1.2" stroke-dasharray="4 3" opacity=".8"><title>${esc(tStr(e.t))}: ${esc(e.txt)}</title></line>`; }
  for (const h of o.hlines || []) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(h.v)}" y2="${Y(h.v)}" stroke="${h.color || 'var(--warn)'}" stroke-width="1.2" stroke-dasharray="6 3"/><text x="${W - pad.r - 2}" y="${Y(h.v) - 3}" text-anchor="end" style="fill:${h.color || 'var(--warn)'}">${esc(h.label || '')}</text>`;
  for (const se of series) {
    const P = se.pts.filter(p => Number.isFinite(p.v));
    if (P.length > 1 && se.line !== false) s += `<polyline fill="none" stroke="${se.color}" stroke-width="1.5" opacity=".8" points="${P.map(p => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')}"/>`;
    for (const p of P) s += `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${p.r || 3}" fill="${p.bad ? 'var(--crit)' : se.color}" stroke="${p.bad ? 'var(--crit)' : 'none'}"><title>${esc(p.title || `${tStr(p.t)}: ${fmt(p.v, 2)}`)}</title></circle>`;
  }
  const d0 = new Date(t0); d0.setHours(0, 0, 0, 0); const nd = Math.ceil((t1 - d0) / 864e5), every = Math.max(1, Math.ceil(nd / 10));
  for (let i = 0; i <= nd; i += every) { const t = +d0 + i * 864e5 + 432e5, d = new Date(t), x = X(t); if (x < pad.l || x > W - pad.r - 10) continue; s += `<text x="${x}" y="${H - 8}" text-anchor="middle">${p2(d.getDate())}/${p2(d.getMonth() + 1)}</text>`; }
  return s + '</svg>';
}
function evtLegend(ev) {
  const ks = [...new Set(ev.map(e => e.type))];
  return ks.length ? `<div class="legend">${ks.map(k => `<span><i style="background:${EVT[k][0]}"></i>${EVT[k][1]} (${ev.filter(e => e.type === k).length})</span>`).join('')}<span class="cat">Rê chuột lên vạch để xem chi tiết</span></div>` : '';
}

/* Hộp tra cứu sự kiện máy quanh một thời điểm (vd một lần QC vi phạm) */
function showEventsAround(t, title, assay, hours = 24) {
  let dlg = document.getElementById('evDlg');
  if (!dlg) { dlg = document.createElement('div'); dlg.id = 'evDlg'; dlg.className = 'modal'; document.body.appendChild(dlg); dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-ev="close"]')) dlg.hidden = true; }); }
  const t0 = t - hours * 3600e3, t1 = t + hours * 3600e3, M = S.M;
  const ev = machEvents(t0, t1, { assay, all: true, types: ['maint', 'temp', 'halt', 'lot', 'cal', 'abort'] });
  for (const c of inWin(M.chk, t0, t1)) ev.push({ t: c.t, type: 'maint', txt: `${c.kind}: ${c.ok ? 'đạt' : 'KHÔNG ĐẠT'} · TB ${fmt(c.mean, 0)} RLU · CV ${fmt(c.cv, 1)}%`, bad: !c.ok });
  if (assay) { const km = kitAssayMap(); let seen = new Set(); for (const e of inWin(M.integ, t0, t1)) { const k = e.lot + '|' + e.kit; if (km.get(k) !== assay || seen.has(k)) continue; seen.add(k); ev.push({ t: e.t, type: 'kit', txt: `Hộp ${assay} lô ${e.lot} / kit ${e.kit} trên làn ${e.lane}: còn ${e.det} test${e.exp ? ' (hết hạn)' : ''}` }); } }
  for (const r of S.D) if (r.cat === 'control' && (!assay || r.assay === assay) && +r.time >= t0 && +r.time <= t1) ev.push({ t: +r.time, type: 'qc', txt: `QC ${r.assay} ${r.sid}: ${r.doseRaw}${r.flags.length ? ' · cờ ' + r.flags.join(', ') : ''}` });
  ev.sort((a, b) => a.t - b.t);
  const has = M.has && M.has.log;
  const rows = ev.map(e => `<tr${Math.abs(e.t - t) < 60e3 ? ' class="sel"' : e.bad ? ' class="hl"' : ''}><td class="mono">${sStr(e.t).slice(5, 16)}</td><td class="num">${(e.t >= t ? '+' : '−') + fmt(Math.abs(e.t - t) / 3600e3, 1)} h</td><td>${e.type === 'qc' ? '<span class="pill p-low">QC</span>' : `<span class="pill" style="background:var(--sunk);color:${EVT[e.type] ? EVT[e.type][0] : 'inherit'}">${esc(EVT[e.type] ? EVT[e.type][1] : e.type)}</span>`}</td><td>${esc(e.txt)}</td></tr>`).join('');
  dlg.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="evTitle"><div class="hd"><h2 id="evTitle">Sự kiện máy ±${hours} giờ quanh ${esc(tStr(t))}</h2><button class="btn" type="button" data-ev="close">Đóng</button></div>
    <div class="sub">${esc(title || '')}</div>
    ${has ? '' : '<div class="note">Chưa có nhật ký máy (LogFile) trong dữ liệu đang mở: chỉ hiện đổi lô, hiệu chuẩn và QC lấy từ FinishedJobs. Nạp file sao lưu .zip để xem đủ bảo trì, nhiệt độ, dừng máy.</div>'}
    ${rows ? `<div class="tablebox" style="max-height:60vh"><table><thead><tr><th>Thời điểm</th><th class="num">Lệch</th><th>Loại</th><th>Chi tiết</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Không có sự kiện nào trong khoảng này.</div>'}</div>`;
  dlg.hidden = false;
}
