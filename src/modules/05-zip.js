/* ---------- Đọc file nén .zip ngay trong trình duyệt ----------
   File sao lưu của LIAISON XL ("<số máy>_temp_archive_<năm>_<tháng>.zip") rất lớn (100–200 MB) vì chứa
   dữ liệu kỹ thuật (C1R*.trc, PIP_*, LLC_*…). Bộ đọc này chỉ đọc mục lục ở cuối file (central directory),
   rồi cắt đúng phần nén của các file cần dùng và giải nén bằng DecompressionStream của trình duyệt.
   Hỗ trợ: nén "store"/"deflate", ZIP64, mã hoá ZipCrypto (file LisLas có mật khẩu). Không hỗ trợ AES. */

const ZIP_MAX_FILES = 30;

function zipErr(code, msg) { const e = new Error(msg); e.code = code; return e; }

async function zipEntries(file) {
  const size = file.size, tailLen = Math.min(size, 65557 + 20);
  const tailBuf = new Uint8Array(await file.slice(size - tailLen).arrayBuffer()), tail = new DataView(tailBuf.buffer);
  let i = tailLen - 22;
  while (i >= 0 && tail.getUint32(i, true) !== 0x06054b50) i--;
  if (i < 0) throw zipErr('NOT_ZIP', 'Không phải file .zip hợp lệ (không tìm thấy mục lục cuối file).');
  let n = tail.getUint16(i + 10, true), cdSize = tail.getUint32(i + 12, true), cdOff = tail.getUint32(i + 16, true);
  if (n === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) {
    const j = i - 20;
    if (j >= 0 && tail.getUint32(j, true) === 0x07064b50) {
      const z64 = Number(tail.getBigUint64(j + 8, true));
      const v = new DataView(await file.slice(z64, z64 + 56).arrayBuffer());
      if (v.getUint32(0, true) === 0x06064b50) { n = Number(v.getBigUint64(32, true)); cdSize = Number(v.getBigUint64(40, true)); cdOff = Number(v.getBigUint64(48, true)); }
    }
  }
  const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()), dv = new DataView(cd.buffer);
  const utf8 = new TextDecoder('utf-8'), latin = new TextDecoder('latin1');
  const out = []; let p = 0;
  while (p + 46 <= cd.length && dv.getUint32(p, true) === 0x02014b50) {
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true);
    const crc = dv.getUint32(p + 16, true); let csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    let lho = dv.getUint32(p + 42, true);
    const nameBytes = cd.subarray(p + 46, p + 46 + nlen);
    const name = (flags & 0x800 ? utf8 : latin).decode(nameBytes);
    let aes = false, x = p + 46 + nlen; const xe = x + xlen;
    while (x + 4 <= xe) {
      const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true); let q = x + 4;
      if (id === 0x0001) {
        if (usize === 0xFFFFFFFF) { usize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (csize === 0xFFFFFFFF) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (lho === 0xFFFFFFFF) { lho = Number(dv.getBigUint64(q, true)); q += 8; }
      } else if (id === 0x9901) aes = true;
      x += 4 + sz;
    }
    if (!name.endsWith('/')) out.push({ name, base: name.split('/').pop(), flags, method, time, date, crc, csize, usize, lho, enc: !!(flags & 1), aes });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

/* ZipCrypto (PKWARE "traditional encryption") */
function zcInit(pw) {
  const k = [0x12345678, 0x23456789, 0x34567890];
  for (const c of new TextEncoder().encode(pw)) zcUpdate(k, c);
  return k;
}
function zcUpdate(k, c) {
  k[0] = (CRC_TABLE[(k[0] ^ c) & 0xff] ^ (k[0] >>> 8)) >>> 0;
  k[1] = (k[1] + (k[0] & 0xff)) >>> 0;
  k[1] = (Math.imul(k[1], 134775813) + 1) >>> 0;
  k[2] = (CRC_TABLE[(k[2] ^ (k[1] >>> 24)) & 0xff] ^ (k[2] >>> 8)) >>> 0;
}
function zcDecrypt(data, pw, e) {
  const k = zcInit(pw), out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const t = (k[2] | 2) & 0xffff, c = data[i] ^ ((Math.imul(t, t ^ 1) >>> 8) & 0xff);
    out[i] = c; zcUpdate(k, c);
  }
  const check = e.flags & 8 ? (e.time >>> 8) & 0xff : (e.crc >>> 24) & 0xff;
  if (out[11] !== check) throw zipErr('BAD_PASSWORD', 'Sai mật khẩu');
  return out.subarray(12);
}

async function inflateRaw(u8) {
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zipRead(file, e, password) {
  const lh = new DataView(await file.slice(e.lho, e.lho + 30).arrayBuffer());
  if (lh.getUint32(0, true) !== 0x04034b50) throw zipErr('BAD_ZIP', 'Mục lục zip hỏng: ' + e.name);
  const start = e.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  let data = new Uint8Array(await file.slice(start, start + e.csize).arrayBuffer());
  if (e.enc) {
    if (e.aes) throw zipErr('AES', 'File zip mã hoá AES – hãy giải nén bằng 7-Zip/WinRAR rồi nạp file .txt.');
    if (password == null) throw zipErr('NEED_PASSWORD', 'Cần mật khẩu');
    data = zcDecrypt(data, password, e);
  }
  let out;
  if (e.method === 0) out = data;
  else if (e.method === 8) {
    try { out = await inflateRaw(data); } catch (err) { throw zipErr(e.enc ? 'BAD_PASSWORD' : 'BAD_ZIP', e.enc ? 'Sai mật khẩu' : 'Không giải nén được ' + e.name); }
  } else throw zipErr('METHOD', `Kiểu nén ${e.method} chưa hỗ trợ (${e.name}).`);
  if (e.enc && crc32(out) !== e.crc) throw zipErr('BAD_PASSWORD', 'Sai mật khẩu');
  return out;
}

// Văn bản trong log: UTF-8, có lẫn ký tự NUL
const TXT_DEC = new TextDecoder('utf-8');
function bytesToText(u8) { const s = TXT_DEC.decode(u8); return s.indexOf('\0') >= 0 ? s.replace(/\0/g, '') : s; }

/* Hộp hỏi mật khẩu zip. Mật khẩu chỉ giữ trong bộ nhớ của phiên làm việc này, không lưu. */
const ZIP_PW = [];
function askZipPassword(fileName, wrong) {
  return new Promise(resolve => {
    let dlg = document.getElementById('pwDlg');
    if (!dlg) { dlg = document.createElement('div'); dlg.id = 'pwDlg'; dlg.className = 'modal'; document.body.appendChild(dlg); }
    dlg.hidden = false;
    dlg.innerHTML = `<form class="modal-box" style="max-width:440px" role="dialog" aria-modal="true" aria-labelledby="pwTitle">
      <div class="hd"><h2 id="pwTitle">File zip có mật khẩu</h2></div>
      <div class="note"><span class="mono">${esc(fileName)}</span> được mã hoá. Nhập mật khẩu để đọc (mật khẩu chỉ dùng trong phiên này, không lưu lại).</div>
      ${wrong ? '<div class="pill p-high" role="alert">Sai mật khẩu, hãy thử lại.</div>' : ''}
      <label>Mật khẩu<input type="password" id="pwIn" autocomplete="off" required></label>
      <div class="rp-actions"><button class="btn" type="button" data-pw="skip">Bỏ qua file này</button><button class="btn primary" type="submit">Mở</button></div></form>`;
    const done = v => { dlg.hidden = true; dlg.innerHTML = ''; resolve(v); };
    dlg.querySelector('form').onsubmit = ev => { ev.preventDefault(); done(dlg.querySelector('#pwIn').value); };
    dlg.querySelector('[data-pw="skip"]').onclick = () => done(null);
    setTimeout(() => dlg.querySelector('#pwIn') && dlg.querySelector('#pwIn').focus(), 30);
  });
}

// Đọc một mục được mã hoá: thử các mật khẩu đã nhập trong phiên, rồi hỏi người dùng
async function zipReadAuto(file, e, ctx) {
  if (!e.enc) return zipRead(file, e);
  const tryPw = async pw => { try { const r = await zipRead(file, e, pw); return r; } catch (err) { if (err.code === 'BAD_PASSWORD') return null; throw err; } };
  if (ctx.pw != null) { const r = await tryPw(ctx.pw); if (r) return r; }
  for (const pw of ZIP_PW) { const r = await tryPw(pw); if (r) { ctx.pw = pw; return r; } }
  if (ctx.skip) throw zipErr('SKIPPED', 'Bỏ qua');
  let wrong = false;
  for (;;) {
    const pw = typeof ctx.ask === 'function' ? await ctx.ask(file.name, wrong) : null;
    if (pw == null) { ctx.skip = true; throw zipErr('SKIPPED', 'Bỏ qua'); }
    const r = await tryPw(pw);
    if (r) { ctx.pw = pw; if (!ZIP_PW.includes(pw)) ZIP_PW.push(pw); return r; }
    wrong = true;
  }
}
