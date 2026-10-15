/* ---------- Khoảng tham chiếu (KTC) suy ra từ cờ của máy, đơn vị, phân loại kết quả ----------
   Log FinishedJobs không ghi con số KTC; máy chỉ gắn cờ AboveNormalRange / BelowNormalRange.
   Từ các mẫu có cờ và không có cờ, giới hạn được khoanh trong một khoảng (a ; b]:
     giới hạn trên  H: mẫu không cờ lớn nhất  <  H  ≤  mẫu có cờ "trên" nhỏ nhất
     giới hạn dưới  L: mẫu có cờ "dưới" lớn nhất  <  L  ≤  mẫu không cờ nhỏ nhất
   Giá trị đại diện là số "gọn" nhất trong khoảng đó (vd 3,598–3,602 → 3,6). */

const UNIT_HINTS = [
  [/^TSH/i, () => 'µIU/mL'],
  [/^FT4/i, hi => hi != null && hi > 6 ? 'pmol/L' : 'ng/dL'],
  [/^FT3/i, hi => hi != null && hi > 8 ? 'pmol/L' : 'pg/mL'],
  [/^(T4|TT4)$/i, hi => hi != null && hi > 30 ? 'nmol/L' : 'µg/dL'],
  [/^(T3|TT3)$/i, hi => hi != null && hi > 5 ? 'nmol/L' : 'ng/mL'],
  [/^(f?PSA|tPSA)/i, () => 'ng/mL'], [/^CEA/i, () => 'ng/mL'], [/^AFP/i, () => 'ng/mL'],
  [/^CA ?(15-?3|125|19-?9|72-?4)/i, () => 'U/mL'], [/^Ferr/i, () => 'ng/mL'],
  [/^HBsAgQ/i, () => 'IU/mL'], [/^aHBs|anti-?HBs/i, () => 'mIU/mL'],
  [/^Ren/i, () => 'µIU/mL'], [/^ALDO/i, hi => hi != null && hi > 150 ? 'pg/mL' : 'ng/dL'],
  [/^Cort/i, hi => hi != null && hi > 100 ? 'nmol/L' : 'µg/dL'], [/^(25)?-?OH|^VitD|^Vit ?D/i, () => 'ng/mL'],
  [/^PTH/i, () => 'pg/mL'], [/^PRL|Prolact/i, () => 'ng/mL'], [/^(FSH|LH)$/i, () => 'mIU/mL'],
  [/^(E2|Estrad)/i, () => 'pg/mL'], [/^Testo/i, () => 'ng/mL'], [/^Prog/i, () => 'ng/mL'],
  [/^Insul/i, () => 'µIU/mL'], [/^C-?Pep/i, () => 'ng/mL'], [/^(hCG|bhCG|βhCG)/i, () => 'mIU/mL'],
  [/^PCT|Procalc/i, () => 'ng/mL'], [/^IgE/i, () => 'IU/mL']
];

// Số "gọn" nhất (ít chữ số có nghĩa nhất) nằm trong (a ; b]; nếu nhiều số cùng độ gọn thì lấy số lớn nhất (gần b)
function niceIn(a, b) {
  if (!(b > a)) return b;
  const top = Math.ceil(Math.log10(Math.max(Math.abs(a), Math.abs(b), 1e-9))) + 1;
  for (let k = top; k >= -7; k--) {
    for (const step of [10 ** k, 10 ** k / 2]) {
      const c = Math.floor((b + step * 1e-9) / step) * step;
      if (c > a + step * 1e-9 && c <= b + 1e-12) return +c.toPrecision(12);
    }
  }
  return b;
}

// Giới hạn coi là xác định được khi khoảng (a ; b] hẹp (≤ 2%), hoặc tương đối hẹp (≤ 12%) và số "gọn" trong đó chỉ có 1–2 chữ số có nghĩa
const sigDigits = v => { const s = Math.abs(v).toPrecision(12).replace(/e.*$/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, ''); return s.length || 1; };
function isPrecise(a, b) { if (!(b > 0)) return false; const w = (b - a) / b; return w <= 0.02 || (w <= 0.12 && sigDigits(niceIn(a, b)) <= 2); }

let REF_CACHE = new Map();
function resetRefCache() { REF_CACHE = new Map(); }

/* Thông tin KTC của một xét nghiệm: {lo, hi, unit, unitGuess, src, n} – lo/hi: {value,a,b,nFlag,conflicts} */
function refInfo(assay) {
  if (REF_CACHE.has(assay)) return REF_CACHE.get(assay);
  const P = S.D.filter(r => r.assay === assay && r.cat === 'patient' && Number.isFinite(r.dose));
  const exact = P.filter(r => !r.qual);
  const hiF = exact.filter(r => r.flags.includes('AboveNormalRange')).map(r => r.dose);
  const loF = exact.filter(r => r.flags.includes('BelowNormalRange')).map(r => r.dose);
  const ok = exact.filter(r => !r.flags.some(f => /NormalRange/.test(f))).map(r => r.dose);
  const res = { assay, n: P.length, nExact: exact.length, src: 'cờ' };
  if (hiF.length) {
    const b = Math.min(...hiF), below = ok.filter(v => v < b), a = below.length ? Math.max(...below) : 0;
    res.hi = { value: niceIn(a, b), a, b, nFlag: hiF.length, conflicts: ok.filter(v => v >= b).length, precise: isPrecise(a, b) };
  }
  if (loF.length) {
    const a = Math.max(...loF), above = ok.filter(v => v > a), b = above.length ? Math.min(...above) : a * 2;
    res.lo = { value: niceIn(a, b), a, b, nFlag: loF.length, conflicts: ok.filter(v => v <= a).length, precise: isPrecise(a, b) };
  }
  const man = RR[assay] || {};
  const mlo = numOr(man.lo), mhi = numOr(man.hi);
  if (mlo !== null) res.lo = { value: mlo, manual: true, precise: true };
  if (mhi !== null) res.hi = { value: mhi, manual: true, precise: true };
  if (mlo !== null || mhi !== null) res.src = 'nhập tay';
  const hint = UNIT_HINTS.find(([re]) => re.test(assay));
  if (man.unit) { res.unit = man.unit; res.unitGuess = false; }
  else if (typeof LISU !== 'undefined' && LISU[assay]) { res.unit = LISU[assay]; res.unitGuess = false; res.unitSrc = 'LIS'; }
  else if (hint) { res.unit = hint[1](res.hi ? res.hi.value : null); res.unitGuess = true; }
  else { res.unit = ''; res.unitGuess = true; }
  res.hasRef = !!(res.lo || res.hi);
  REF_CACHE.set(assay, res);
  return res;
}
const refLo = a => { const r = refInfo(a).lo; return r ? r.value : null; };
const refHi = a => { const r = refInfo(a).hi; return r ? r.value : null; };
const unitOf = a => refInfo(a).unit || '';

/* Phân loại một kết quả: 'low' | 'normal' | 'high'
   - Có KTC nhập tay: so trực tiếp với số nhập.
   - Không: theo cờ của máy; riêng kết quả có dấu < hoặc > (ngoài ngưỡng đo, máy không gắn cờ KTC)
     thì so với KTC suy ra từ cờ. */
function classify(r) {
  const lo = refLo(r.assay), hi = refHi(r.assay), info = refInfo(r.assay);
  const v = r.dose;
  if (info.src === 'nhập tay' || r.qual) {
    if (!Number.isFinite(v)) return 'normal';
    if (r.qual === '<') return (lo !== null && v <= lo) ? 'low' : 'normal';
    if (r.qual === '>') return (hi !== null && v >= hi) ? 'high' : 'normal';
    if (lo !== null && v < lo) return 'low';
    if (hi !== null && v > hi) return 'high';
    return 'normal';
  }
  const lref = r.logRange && r.logRange.ref;
  if (lref && (lref.lo != null || lref.hi != null) && Number.isFinite(v)) {
    if (lref.lo != null && v < lref.lo) return 'low';
    if (lref.hi != null && v > lref.hi) return 'high';
    return 'normal';
  }
  if (r.flags.includes('AboveNormalRange')) return 'high';
  if (r.flags.includes('BelowNormalRange')) return 'low';
  return 'normal';
}

function fmtRef(assay) {
  const i = refInfo(assay);
  if (!i.hasRef) return '–';
  const fx = x => (x.precise || x.manual ? '' : '≈') + fmt(x.value, 4);
  const lo = i.lo ? fx(i.lo) : '', hi = i.hi ? fx(i.hi) : '';
  const s = i.lo && i.hi ? `${lo} – ${hi}` : i.hi ? `≤ ${hi}` : `≥ ${lo}`;
  return s + (i.unit ? ' ' + i.unit : '');
}

// Cột "KTC suy ra từ cờ" trong bảng khoảng tham chiếu
function inferRef(a) {
  const i = refInfo(a);
  if (!i.hasRef) return '<span class="cat">Không có cờ KTC</span>';
  const part = (x, nm) => x ? `${nm} ${esc(fmt(x.value, 4))}${x.manual ? '' : ` <span class="cat">(${esc(fmt(x.a, 4))} – ${esc(fmt(x.b, 4))})</span>`}` : '';
  return [part(i.lo, 'thấp'), part(i.hi, 'cao')].filter(Boolean).join(' · ') + (i.unit ? ` <span class="cat">${esc(i.unit)}${i.unitGuess ? '*' : ''}</span>` : '');
}
