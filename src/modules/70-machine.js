/* ---------- Nhật ký vận hành của máy: LogFile, DilutionLog, LIS (ASTM) ----------
   Mỗi nguồn nạp (một file .zip sao lưu hoặc một file .txt/.TRC lẻ) được đọc thành một "entry":
     { name, label, size, kind, serial, month, text (FinishedJobs), M (sự kiện máy), parts (loại dữ liệu tìm thấy) }
   Chỉ giữ lại các dòng có ích cho phân tích (vài chục nghìn sự kiện/tháng), văn bản gốc được bỏ đi ngay. */

// Loại file theo tên (cả trong zip lẫn file lẻ)
function srcKind(name) {
  const b = name.split(/[\\/]/).pop();
  if (/^FinishedJobs.*\.txt$/i.test(b) && !/stratec/i.test(b)) return 'fj';
  if (/^LogFile_.*\.txt$/i.test(b)) return 'log';
  if (/^DilutionLog.*\.txt$/i.test(b)) return 'dil';
  if (/^C2R\d*\.TRC$/i.test(b)) return 'lis';
  return '';
}
const KIND_LABEL = { fj: 'Kết quả (FinishedJobs)', log: 'Nhật ký máy (LogFile)', dil: 'Pha loãng (DilutionLog)', lis: 'Giao tiếp LIS (ASTM)' };

// "2210005303_temp_archive_2026_09.zip", "2210005303_temp_archiveLisLas_2026_09.zip"
function archiveInfo(name) {
  const m = name.match(/(\d{8,12})_temp_archive([A-Za-z]*)_(\d{4})_(\d{2})/);
  return m ? { serial: m[1], sub: m[2], month: `${m[3]}-${m[4]}` } : {};
}

function emptyM() {
  return { tubes: [], unl: [], sched: [], asp: [], fails: [], aborts: [], maint: [], chk: [], temps: [], integ: [], calExp: [], starter: [], phases: [], lisTo: [], users: [], states: [], dil: [], lisQ: [], lisO: [], lisR: [] };
}

const LT = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19), +(s.slice(20, 23) || 0)).getTime();

/* LogFile_yyyy-mm-dd.txt
   2026.09.03_08:46:06.614 - (1478336:187) (CM_SAMPLE_BAY)      264.000.00058:  - Tube loaded: Lane 1, Position 1, Barcode '1463' */
function parseLogFile(text, M, info) {
  let i = 0; const n = text.length;
  while (i < n) {
    let j = text.indexOf('\n', i); if (j < 0) j = n;
    const line = text.charCodeAt(j - 1) === 13 ? text.slice(i, j - 1) : text.slice(i, j); i = j + 1;
    const k = line.indexOf(':  - '); if (k < 0 || line.length < 24) continue;
    const msg = line.slice(k + 5), c0 = msg.charCodeAt(0);
    let m;
    // Lọc nhanh theo ký tự đầu để khỏi chạy regex trên mọi dòng
    if (c0 === 84) { // T
      if (msg.startsWith('Tube loaded') && (m = msg.match(/^Tube loaded: Lane (\d+), Position (\d+), Barcode '(.+)'/))) M.tubes.push({ t: LT(line), lane: +m[1], pos: +m[2], sid: m[3] });
      else if (msg.startsWith('Tube unloaded') && (m = msg.match(/^Tube unloaded: Lane (\d+), Position (\d+), Barcode '(.+)'/))) M.unl.push({ t: LT(line), lane: +m[1], sid: m[3] });
      else if (msg.startsWith('Tube Heater temperature') && (m = msg.match(/^Tube Heater temperature is (out of range|now in range) \(([\d.]+)/))) M.temps.push({ t: LT(line), part: 'Tube Heater', out: m[1][0] === 'o', v: +m[2] });
      else if ((m = msg.match(/^The Analyzer Serial Number is (\d+)/))) info.serial = info.serial || m[1];
    } else if (c0 === 83) { // S
      if (msg.startsWith('Scheduled Job') && (m = msg.match(/^Scheduled Job '(.*?)' '(.*?)' \((\d+)\) for Cycle (\d+)/))) M.sched.push({ t: LT(line), sid: m[1], assay: m[2], rep: +m[3], cyc: +m[4] });
      else if (msg.startsWith('Starter loaded') && (m = msg.match(/Lot Number: (\w+), Vial Number (\w+), Lane: (\d+), remaining Shots: (\d+)/))) M.starter.push({ t: LT(line), lot: m[1], vial: m[2], lane: +m[3], shots: +m[4] });
      else if ((m = msg.match(/^(Starter \w+) entering (\w+) phase/))) M.phases.push({ t: LT(line), item: m[1], ph: m[2] });
    } else if (c0 === 65) { // A
      if (msg.startsWith('Aspirated Sample') && (m = msg.match(/^Aspirated Sample for Job '(.*?)' '(.*?)' \((\d+)\) \(JobID (\d+)/))) M.asp.push({ t: LT(line), sid: m[1], assay: m[2], rep: +m[3], job: +m[4] });
      else if (msg.startsWith('Aborted Job') && (m = msg.match(/^Aborted Job '(.*?)' '(.*?)' \((\d+)\)\. Reason: (.+?)\.?\s*$/))) M.aborts.push({ t: LT(line), sid: m[1], assay: m[2], rep: +m[3], reason: m[4] });
      else if (msg.startsWith('All reagent temperatures back')) M.temps.push({ t: LT(line), part: 'Khoang thuốc thử', out: false, v: +((msg.match(/\(([\d.]+)/) || [])[1]) });
    } else if (c0 === 70) { // F
      if (msg.startsWith('Failed to Aspirate') && (m = msg.match(/^Failed to Aspirate (\w+) for Job '(.*?)' '(.*?)' \((\d+)\), (.+?) \(JobID/))) M.fails.push({ t: LT(line), what: m[1], sid: m[2], assay: m[3], rep: +m[4], reason: m[5] });
    } else if (c0 === 77) { // M
      if (msg.startsWith('Maintenance Task') && (m = msg.match(/^Maintenance Task (.+?)(?: \(Step: ?(\d+):\s*(.*?)\))? ?(succeeded|failed|was cancelled)/))) M.maint.push({ t: LT(line), task: m[1].trim(), step: m[2] ? +m[2] : 0, stepName: m[3] || '', st: m[4] === 'succeeded' ? 'ok' : m[4] === 'failed' ? 'fail' : 'cancel' });
      else if ((m = msg.match(/^Middle reagent temperature out of range \(([\d.]+)/))) M.temps.push({ t: LT(line), part: 'Khoang thuốc thử (giữa)', out: true, v: +m[1] });
    } else if (c0 === 66) { // B
      if ((m = msg.match(/^BGW was run with result: (\w+)\..*?Mean: ([\d.]+)\. CV: ([\d.]+)%/))) M.chk.push({ t: LT(line), kind: 'BGW', ok: m[1] === 'Passed', mean: +m[2], cv: +m[3] });
    } else if (c0 === 76) { // L
      if ((m = msg.match(/^Light Check for (left|right) arm was run with result: (\w+)\..*?Mean: ([\d.]+)\.? ?CV: ([\d.]+)%/))) M.chk.push({ t: LT(line), kind: m[1] === 'left' ? 'LC trái' : 'LC phải', ok: m[2] === 'Passed', mean: +m[3], cv: +m[4] });
      else if ((m = msg.match(/^(Left|Right) reagent temperature out of range \(([\d.]+)/))) M.temps.push({ t: LT(line), part: m[1] === 'Left' ? 'Khoang thuốc thử (trái)' : 'Khoang thuốc thử (phải)', out: true, v: +m[2] });
      else if ((m = msg.match(/^(Liquid Waste) entering (\w+) phase/))) M.phases.push({ t: LT(line), item: m[1], ph: m[2] });
    } else if (c0 === 73) { // I
      if (msg.startsWith('Integral') && (m = msg.match(/^Integral( \(obs expired\))? found at lane (\d+) with ArticleNo (\w+), LotNo (\w+), KitNo (\w+), rem\. Det\. (\d+), rem\. Calibr\. (\d+)/))) M.integ.push({ t: LT(line), lane: +m[2], art: m[3], lot: m[4], kit: m[5], det: +m[6], cal: +m[7], exp: !!m[1] });
      else if ((m = msg.match(/^Incubator temperature (?:is )?(out of range|now in range)(?: \(([\d.]+))?/))) M.temps.push({ t: LT(line), part: 'Buồng ủ', out: m[1][0] === 'o', v: m[2] ? +m[2] : NaN });
    } else if (c0 === 67) { // C
      if (msg.startsWith('COP status changed') && (m = msg.match(/^COP status changed from '(.*?)' to '(.*?)'/))) { if (!/Active/.test(m[1]) || !/Active/.test(m[2])) M.states.push({ t: LT(line), from: m[1], to: m[2] }); }
      else if ((m = msg.match(/^Calibration for Integral in lane (\d+) is expired \((.+?)\)/))) M.calExp.push({ t: LT(line), lane: +m[1], assay: m[2] });
      else if ((m = msg.match(/^(Cuvettes) entering (\w+) phase/))) M.phases.push({ t: LT(line), item: m[1], ph: m[2] });
    } else if (c0 === 78) { // N
      if (msg.startsWith('No response to query') && (m = msg.match(/workorder for SID (.+?) within (\d+) seconds/))) M.lisTo.push({ t: LT(line), sid: m[1], sec: +m[2] });
    } else if (c0 === 85) { // U
      if ((m = msg.match(/^User (\S+) logged in at level (\d+)/))) M.users.push({ t: LT(line), user: m[1], level: +m[2] });
    } else if (c0 === 68 || c0 === 87) { // D, W
      if ((m = msg.match(/^(Disposable Tips|Wash Liquid|System Liquid|Solid Waste) entering (\w+) phase/))) M.phases.push({ t: LT(line), item: m[1], ph: m[2] });
    }
    if (c0 === 83 && (m = msg.match(/^(System Liquid|Solid Waste) entering (\w+) phase/))) M.phases.push({ t: LT(line), item: m[1], ph: m[2] });
  }
}

/* DilutionLog.txt: "2026.09.03-10.03.04 - 1st Step - Assay: HCG, Dilution: 1:10, …" rồi "JobId 1478557: Use …" */
function parseDilution(text, M) {
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    let m = line.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}) - (.*)$/); if (!m) continue;
    const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), msg = m[7];
    if ((m = msg.match(/Step - Assay: (.+?), Dilution: 1:([\d.]+)/))) cur = { t, assay: m[1], f: +(+m[2]).toPrecision(4) };
    else if ((m = msg.match(/^JobId (\d+): Use SampleDilution/)) && cur && t - cur.t < 120e3) {
      const job = +m[1]; if (!M.dil.some(d => d.job === job && Math.abs(d.t - t) < 600e3)) M.dil.push({ t, job, assay: cur.assay, f: cur.f });
    }
  }
}

/* LIS – vết bản ghi ASTM (C2R*.TRC):
   2026-09-03, 08:46:07,677\t<- Q|1|1463\90952||ALL||||||||O<CR>         máy hỏi y lệnh
   2026-09-03, 08:46:09,105\t-> O|1|1463||^^^FT4|N|20260903085226<CR>    LIS trả y lệnh
   2026-09-03, 09:05:04,750\t<- O|1|90952||^^^CortS^|R…  + <- R|1|^^^CortS^^DOSE|187.8|nmol/L||N||F||||20260903090451 */
function parseASTM(text, M) {
  let curSid = '';
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{4})-(\d{2})-(\d{2}), (\d{2}):(\d{2}):(\d{2}),(\d{3})\t(<-|->) (.*?)(?:<CR>)?$/); if (!m) continue;
    const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]).getTime(), dir = m[8], f = m[9].split('|');
    const rec = f[0];
    if (dir === '<-' && rec === 'Q') M.lisQ.push({ t, sids: (f[2] || '').split('\\').filter(Boolean) });
    else if (dir === '->' && rec === 'O') M.lisO.push({ t, sid: f[2] || '', test: (f[4] || '').split('^')[3] || '', prio: f[5] || '' });
    else if (dir === '<-' && rec === 'O') curSid = f[2] || '';
    else if (dir === '<-' && rec === 'R') {
      const ts = f[12] || '', test = (f[2] || '').split('^')[3] || '';
      const rt = ts.length >= 14 ? new Date(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12), +ts.slice(12, 14)).getTime() : NaN;
      M.lisR.push({ t, sid: curSid, test, val: f[3] || '', unit: f[4] || '', flag: f[6] || '', rt });
    }
  }
}

/* Đọc một file người dùng chọn (zip hoặc txt) → entry. onStep(msg) để báo tiến độ. */
async function readSource(file, ctx = {}, onStep = () => { }) {
  const info = { ...archiveInfo(file.name) };
  const entry = { name: file.name, size: file.size, kind: /\.zip$/i.test(file.name) ? 'zip' : 'txt', text: '', M: emptyM(), parts: {}, skipped: 0, warn: '' };
  const add = (k, n = 1) => { entry.parts[k] = (entry.parts[k] || 0) + n; };
  const handle = async (kind, name, text) => {
    if (kind === 'fj') { entry.text += (entry.text ? '\n' : '') + text; add('fj'); }
    else if (kind === 'log') { parseLogFile(text, entry.M, info); add('log'); }
    else if (kind === 'dil') { parseDilution(text, entry.M); add('dil'); }
    else if (kind === 'lis') { parseASTM(text, entry.M); add('lis'); }
  };
  if (entry.kind === 'zip') {
    const list = await zipEntries(file);
    const want = list.filter(e => srcKind(e.name));
    entry.skipped = list.length - want.length;
    let k = 0;
    for (const e of want) {
      onStep(`${file.name}: ${++k}/${want.length} ${e.base}`);
      try { await handle(srcKind(e.name), e.name, bytesToText(await zipReadAuto(file, e, ctx))); }
      catch (err) { if (err.code === 'SKIPPED') { entry.warn = 'Bỏ qua phần có mật khẩu.'; break; } throw err; }
    }
  } else {
    let kind = srcKind(file.name); const text = await file.text();
    if (!kind) kind = /^[RD]-\|\(\d{4}\//m.test(text) ? 'fj' : /^\d{4}\.\d{2}\.\d{2}_\d{2}:\d{2}:\d{2}\.\d{3} - \(/m.test(text) ? 'log' : /\t(<-|->) [HQOR]\|/.test(text) ? 'lis' : '';
    if (kind) await handle(kind, file.name, text);
  }
  if (!info.serial) { const m = file.name.match(/(\d{10})/); if (m && entry.kind === 'zip') info.serial = m[1]; }
  entry.serial = info.serial || '';
  entry.month = info.month || '';
  for (const k in entry.M) entry.M[k].sort((a, b) => a.t - b.t);
  if (!entry.month) { const ts = entry.text.match(/\((\d{4})\/(\d{2})\//); if (ts) entry.month = `${ts[1]}-${ts[2]}`; else { const any = Object.values(entry.M).find(a => a.length); if (any) { const d = new Date(any[0].t); entry.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; } } }
  entry.hasData = !!entry.text || Object.values(entry.M).some(a => a.length);
  return entry;
}

/* Gộp sự kiện máy từ nhiều entry, bỏ trùng (hai file sao lưu chồng thời gian) */
let MACH = emptyM();
const MKEY = {
  tubes: e => e.t + e.sid + e.pos, unl: e => e.t + e.sid, sched: e => e.t + e.sid + e.assay + e.rep, asp: e => e.job + e.sid + e.assay, fails: e => e.t + e.sid + e.assay,
  aborts: e => e.t + e.sid + e.assay + e.rep, maint: e => e.t + e.task + e.step + e.st, chk: e => e.t + e.kind, temps: e => e.t + e.part + e.out, integ: e => e.t + e.lane + e.kit,
  calExp: e => e.t + e.lane, starter: e => e.t + e.lane + e.vial, phases: e => e.t + e.item + e.ph, lisTo: e => e.t + e.sid, users: e => e.t + e.user, states: e => e.t + e.to,
  dil: e => e.job, lisQ: e => e.t + e.sids.join(), lisO: e => e.t + e.sid + e.test, lisR: e => e.t + e.sid + e.test
};
function mergeMachine(entries) {
  const M = emptyM();
  for (const k in M) {
    const seen = new Set();
    for (const en of entries) for (const e of (en.M && en.M[k]) || []) { const key = MKEY[k](e); if (seen.has(key)) continue; seen.add(key); M[k].push(e); }
    M[k].sort((a, b) => a.t - b.t);
  }
  M.has = { log: M.tubes.length + M.sched.length + M.maint.length > 0, lis: M.lisQ.length + M.lisO.length + M.lisR.length > 0, dil: M.dil.length > 0 };
  return M;
}
