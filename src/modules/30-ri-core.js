/* ---------- Ước tính khoảng tham chiếu từ dữ liệu thường quy (phương pháp gián tiếp) ----------
   Ý tưởng theo nhóm thuật toán "truncated minimum chi-square" (TMC; Wosniok & Haeckel, CCLM 2019)
   và refineR (Ammer và cs., Sci Rep 2021), được khuyến nghị bởi IFCC C-RIDL (Jones và cs., CCLM 2019):
     1. Dữ liệu bệnh nhân là hỗn hợp "không bệnh lý" + "bệnh lý". Phần không bệnh lý, sau biến đổi
        Box-Cox thích hợp, có phân bố gần chuẩn và chiếm phần lõi của dữ liệu.
     2. Với mỗi λ (Box-Cox) và mỗi khoảng cắt [a ; b] quanh lõi, khớp phân bố chuẩn bị cắt cụt vào
        histogram trong khoảng đó bằng tiêu chuẩn chi-bình-phương nhỏ nhất.
     3. Chọn bộ (λ, a, b) tối ưu theo tiêu chuẩn kết hợp độ khớp và độ phủ dữ liệu.
     4. KTC = biến đổi ngược của μ ± 1,96σ (bách phân vị 2,5 – 97,5).
     5. Khoảng tin cậy 90% của mỗi giới hạn bằng bootstrap.
   Toàn bộ là hàm thuần (không đụng giao diện) để kiểm thử độc lập. */

const RI_CFG = {
  lambdas: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  q1: [0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3],
  q2: [0.7, 0.75, 0.8, 0.85, 0.875, 0.9, 0.925, 0.95, 0.97, 0.98, 0.99, 0.995],
  minFrac: 0.4,     // khoảng cắt phải chứa ít nhất 40% dữ liệu
  maxP: 1.05,       // tỷ lệ "không bệnh lý" ước tính không được vượt quá ~100%
  wCover: 5,        // trọng số ưu tiên khoảng cắt rộng (hiệu chỉnh bằng mô phỏng, xem scripts/ri_simulation)
  boot: 100, minN: 120, z: 1.959964
}

const bc = (x, l) => l === 0 ? Math.log(x) : (x ** l - 1) / l;
const bcInv = (y, l) => l === 0 ? Math.exp(y) : Math.max(l * y + 1, 0) ** (1 / l);

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const phi = z => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/* Chuẩn bị dữ liệu cho một λ: giá trị biến đổi đã sắp xếp + tổng cộng dồn (để tính trung bình/phương sai
   của bất kỳ đoạn nào trong O(1)). */
function prepLambda(xSorted, l) {
  const ys = xSorted.map(v => bc(v, l)), n = ys.length, c1 = new Float64Array(n + 1), c2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { c1[i + 1] = c1[i] + ys[i]; c2[i + 1] = c2[i] + ys[i] * ys[i]; }
  return { ys, c1, c2, l };
}
const lowerIdx = (ys, v) => { let lo = 0, hi = ys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ys[m] < v) lo = m + 1; else hi = m; } return lo; };
const upperIdx = (ys, v) => { let lo = 0, hi = ys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ys[m] <= v) lo = m + 1; else hi = m; } return lo; };

/* Ước lượng hợp lý cực đại của phân bố chuẩn cắt cụt hai phía (giới hạn cắt a, b đã biết):
   cân bằng trung bình và phương sai mẫu trong [a;b] với trung bình/phương sai lý thuyết (Cohen, 1950). */
function truncMLE(mt, vt, a, b) {
  let m = mt, s = Math.sqrt(vt);
  for (let it = 0; it < 120; it++) {
    const al = (a - m) / s, be = (b - m) / s, Z = normCdf(be) - normCdf(al);
    if (!(Z > 1e-12)) return null;
    const pa = phi(al), pb = phi(be), d = (pa - pb) / Z, f = 1 + (al * pa - be * pb) / Z - d * d;
    if (!(f > 1e-6)) return null;
    const s2 = Math.sqrt(vt / f), m2 = mt - s2 * d;
    const ds = s2 - s, dm = m2 - m;
    s = s + 0.9 * ds; m = m + 0.9 * dm;
    if (!(s > 0) || !Number.isFinite(m)) return null;
    if (Math.abs(ds) < 1e-6 * s && Math.abs(dm) < 1e-6 * s) break;
    if (s > 50 * (b - a)) return null;
  }
  return { m, s };
}

/* Khớp phân bố chuẩn cắt cụt trong [a ; b] và tính χ² độ khớp trên các khoảng chia đều */
function fitTruncated(L, a, b, N) {
  const { ys, c1, c2 } = L, i0 = lowerIdx(ys, a), i1 = upperIdx(ys, b), nIn = i1 - i0;
  if (nIn < 30 || !(b > a)) return null;
  const mt = (c1[i1] - c1[i0]) / nIn, vt = Math.max((c2[i1] - c2[i0]) / nIn - mt * mt, 1e-12);
  const e = truncMLE(mt, vt, a, b); if (!e) return null;
  const { m, s } = e, Fa = normCdf((a - m) / s), Fb = normCdf((b - m) / s), den = Fb - Fa;
  const nb = Math.max(6, Math.min(30, Math.round(Math.sqrt(nIn) / 1.5))), w = (b - a) / nb;
  let chi = 0, prevF = Fa, prevI = i0;
  for (let k = 1; k <= nb; k++) {
    const edge = a + k * w, curI = k === nb ? i1 : upperIdx(ys, edge), curF = k === nb ? Fb : normCdf((edge - m) / s);
    const E = nIn * (curF - prevF) / den, O = curI - prevI; chi += (O - E) ** 2 / Math.max(E, 0.5);
    prevF = curF; prevI = curI;
  }
  return { m, s, chi2: chi, df: Math.max(1, nb - 3), nIn, P: nIn / (N * den), frac: nIn / N };
}

// Ngưỡng chi-bình-phương (xấp xỉ Wilson–Hilferty) ứng với mức ý nghĩa 1%
const chi2Crit = df => df * (1 - 2 / (9 * df) + 2.326 * Math.sqrt(2 / (9 * df))) ** 3;

/* Duyệt (λ, a, b). Mỗi ứng viên được chấm điểm:
     điểm = χ²/df  +  phạt "vượt đuôi"  +  wCover × (1 − tỷ lệ dữ liệu trong khoảng cắt)
   – χ²/df: phân bố chuẩn cắt cụt có khớp phần lõi không;
   – vượt đuôi: số mẫu không bệnh lý mà mô hình dự kiến nằm ngoài [a;b] không được nhiều hơn số mẫu thực có;
   – độ phủ: ưu tiên khoảng cắt rộng (dùng nhiều dữ liệu hơn, ước tính ổn định hơn). */
function riFitAll(xs, cfg = RI_CFG) {
  const x = xs.filter(v => v > 0).sort((p, q) => p - q), N = x.length;
  let best = null;
  for (const l of cfg.lambdas) {
    const L = prepLambda(x, l);
    for (const q1 of cfg.q1) for (const q2 of cfg.q2) {
      if (q2 - q1 < cfg.minFrac) continue;
      const a = quantile(L.ys, q1), b = quantile(L.ys, q2);
      const f = fitTruncated(L, a, b, N); if (!f || f.P > cfg.maxP) continue;
      const expL = f.P * N * normCdf((a - f.m) / f.s), expR = f.P * N * (1 - normCdf((b - f.m) / f.s));
      const over = Math.max(0, expL - q1 * N) / Math.sqrt(expL + 1) + Math.max(0, expR - (1 - q2) * N) / Math.sqrt(expR + 1);
      const score = f.chi2 / f.df + over + cfg.wCover * (1 - f.frac);
      if (!best || score < best.score) best = { ...f, l, q1, q2, a, b, over, score, accepted: f.chi2 <= chi2Crit(f.df) };
    }
  }
  if (!best) return null;
  best.lo = bcInv(best.m - cfg.z * best.s, best.l);
  best.hi = bcInv(best.m + cfg.z * best.s, best.l);
  best.N = N;
  return best;
}

/* Ước tính đầy đủ: điểm ước tính + khoảng tin cậy 90% bằng bootstrap.
   Mỗi lần bootstrap chạy lại TOÀN BỘ việc chọn λ và khoảng cắt, nên khoảng tin cậy phản ánh cả
   độ bất định của bước chọn mô hình. */
function estimateRI(xs, opt = {}) {
  const x = xs.filter(v => Number.isFinite(v) && v > 0);
  if (x.length < 40) return null;
  const fit = riFitAll(x); if (!fit) return null;
  const B = opt.boot ?? RI_CFG.boot, rnd = mulberry32(opt.seed ?? 20251014), los = [], his = [];
  const near = (arr, v, k) => { const i = arr.indexOf(v); return arr.slice(Math.max(0, i - k), i + k + 1); };
  const local = { ...RI_CFG, lambdas: near(RI_CFG.lambdas, fit.l, 2), q1: near(RI_CFG.q1, fit.q1, 2), q2: near(RI_CFG.q2, fit.q2, 2) };
  for (let b = 0; b < B; b++) {
    const s = new Array(x.length); for (let i = 0; i < x.length; i++) s[i] = x[Math.floor(rnd() * x.length)];
    const f = riFitAll(s, local); if (!f) continue;
    los.push(f.lo); his.push(f.hi);
    if (opt.onProgress && b % 10 === 9) opt.onProgress((b + 1) / B);
  }
  los.sort((p, q) => p - q); his.sort((p, q) => p - q);
  return { ...fit, method: 'gián tiếp', ciLo: [quantile(los, .05), quantile(los, .95)], ciHi: [quantile(his, .05), quantile(his, .95)], bootLo: los, bootHi: his, B: los.length };
}

/* Phi tham số theo CLSI EP28-A3c: loại ngoại lai Tukey (trên thang Box-Cox), bách phân vị 2,5 & 97,5
   theo hạng r = p(n+1), khoảng tin cậy 90% theo hạng (xấp xỉ nhị thức). Cần n ≥ 120. */
function nonparamRI(xs, lambda = 0) {
  const x = xs.filter(v => Number.isFinite(v) && v > 0).sort((p, q) => p - q);
  if (x.length < 20) return null;
  const ys = x.map(v => bc(v, lambda)), q1 = quantile(ys, .25), q3 = quantile(ys, .75), iqr = q3 - q1;
  const keep = [], out = [];
  x.forEach((v, i) => (ys[i] < q1 - 1.5 * iqr || ys[i] > q3 + 1.5 * iqr ? out : keep).push(v));
  const n = keep.length;
  const at = r => { r = Math.min(Math.max(r, 1), n); const i = Math.floor(r) - 1, f = r - Math.floor(r); return keep[i] + f * ((keep[Math.min(i + 1, n - 1)]) - keep[i]); };
  const pr = p => { const r = p * (n + 1), h = 1.645 * Math.sqrt(n * p * (1 - p)); return { v: at(r), ci: [at(Math.floor(n * p - h + 0.5)), at(Math.ceil(n * p + h + 0.5))] }; };
  const L = pr(0.025), H = pr(0.975);
  return { method: 'phi tham số', n, nOut: out.length, outliers: out, kept: keep, lo: L.v, hi: H.v, ciLo: L.ci, ciHi: H.ci, enough: n >= RI_CFG.minN, lambda };
}

/* So sánh giới hạn đang dùng với giá trị ước tính */
function riVerdict(cur, est, ci, n) {
  if (cur == null) return { k: 'na', t: 'Không có giới hạn' };
  if (!est || !Number.isFinite(est)) return { k: 'na', t: 'Không ước tính được' };
  if (n < RI_CFG.minN) return { k: 'few', t: 'Không đủ dữ liệu' };
  const dev = (cur - est) / est * 100;
  if (cur >= ci[0] && cur <= ci[1]) return { k: 'ok', t: 'Phù hợp', dev };
  return { k: 'warn', t: `Cần xem xét: KTC ${dev > 0 ? 'cao' : 'thấp'} hơn ước tính ${fmt(Math.abs(dev), 0)}%`, dev };
}
