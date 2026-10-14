/* Kiểm chứng thuật toán ước tính KTC gián tiếp trên dữ liệu mô phỏng đã biết KTC thật.
   Chạy:  python3 scripts/build.py && node scripts/ri_simulation.js [số vòng bootstrap, mặc định 100]
   Nạp phần script của web/index.html trong Node (DOM giả), sinh dữ liệu hỗn hợp "khoẻ + bệnh lý",
   so sánh KTC ước tính với KTC thật. */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const mk = () => ({ innerHTML: '', querySelectorAll: () => [], querySelector: () => mk(), addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} }, closest() { return null; }, style: {}, dataset: {}, appendChild() {} });
global.document = { querySelectorAll: () => [], getElementById: () => mk(), querySelector: () => mk(), addEventListener() {}, createElement: () => mk(), body: mk() };
global.window = {}; global.localStorage = { getItem: () => null, setItem() {} }; global.matchMedia = () => ({ matches: false });
global.getComputedStyle = () => ({ getPropertyValue: () => '' }); global.navigator = {}; global.addEventListener = () => {}; global.location = { protocol: 'file:' };
const BOOT = +(process.argv[2] || 100);
eval(src + `;(() => {
const R = mulberry32(11); const gauss = () => { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
const gen = (spec, N) => { const o = []; for (let i = 0; i < N; i++) { let r = R(), a = 0; for (const c of spec) { a += c.w; if (r < a) { o.push(c.log ? Math.exp(c.m + c.s * gauss()) : Math.max(1e-4, c.m + c.s * gauss())); break; } } } return o; };
const LN = (med, s) => [Math.exp(Math.log(med) - 1.96 * s), Math.exp(Math.log(med) + 1.96 * s)];
const scen = {
  'TSH, 75% khoẻ, bệnh lý chồng lấn': { t: LN(1.5, .55), spec: [{ w: .75, log: 1, m: Math.log(1.5), s: .55 }, { w: .12, log: 1, m: Math.log(.03), s: 1.2 }, { w: .13, log: 1, m: Math.log(8), s: .8 }] },
  'TSH, 85% khoẻ, bệnh lý tách xa': { t: LN(1.5, .55), spec: [{ w: .85, log: 1, m: Math.log(1.5), s: .55 }, { w: .07, log: 1, m: Math.log(.01), s: .8 }, { w: .08, log: 1, m: Math.log(15), s: .7 }] },
  'FT4, 85% khoẻ': { t: [1.2 - 1.96 * .2, 1.2 + 1.96 * .2], spec: [{ w: .85, m: 1.2, s: .2 }, { w: .07, m: .6, s: .15 }, { w: .08, m: 2.2, s: .6 }] },
  'Khoẻ 100%, log-chuẩn': { t: LN(3, .4), spec: [{ w: 1, log: 1, m: Math.log(3), s: .4 }] },
  'Khoẻ 100%, chuẩn': { t: [100 - 19.6, 100 + 19.6], spec: [{ w: 1, m: 100, s: 10 }] },
  'Khoẻ 70% + bệnh lý cao 30%': { t: LN(20, .3), spec: [{ w: .7, log: 1, m: Math.log(20), s: .3 }, { w: .3, log: 1, m: Math.log(60), s: .6 }] }
};
let err = 0, n = 0, cov = 0, tot = 0;
for (const [name, sc] of Object.entries(scen)) for (const N of [300, 1000, 5000]) {
  const e = estimateRI(gen(sc.spec, N), { boot: BOOT });
  const el = (e.lo - sc.t[0]) / sc.t[0] * 100, eh = (e.hi - sc.t[1]) / sc.t[1] * 100; err += Math.abs(el) + Math.abs(eh); n += 2;
  if (e.B) { tot += 2; cov += (sc.t[0] >= e.ciLo[0] && sc.t[0] <= e.ciLo[1]) + (sc.t[1] >= e.ciHi[0] && sc.t[1] <= e.ciHi[1]); }
  console.log(name.padEnd(36), String(N).padStart(5), 'thật', sc.t.map(v => v.toFixed(3)).join(' – '), '| ước tính', e.lo.toFixed(3), '–', e.hi.toFixed(3), '| sai số %', el.toFixed(1), eh.toFixed(1));
}
console.log('Sai số tuyệt đối trung bình: ' + (err / n).toFixed(1) + '%' + (tot ? '; CI 90% chứa giá trị thật: ' + cov + '/' + tot : ''));
})();`);
