// LabLog Analyzer — tiến trình chính (Electron)
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null;
const pending = [];

function decode(buf) {
  // Log máy có thể là UTF-8 hoặc UTF-16 LE/BE (có BOM)
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) { const b = Buffer.from(buf.slice(2)); b.swap16(); return b.toString('utf16le'); }
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString('utf8');
  return buf.toString('utf8');
}

function readList(paths) {
  const list = [];
  for (const p of paths) {
    try {
      if (!fs.statSync(p).isFile()) continue;
      list.push({ name: path.basename(p), text: decode(fs.readFileSync(p)) });
    } catch (e) {
      if (app.isReady()) dialog.showErrorBox('Không mở được file', `${p}\n\n${e.message}`);
    }
  }
  return list;
}

function sendFiles(paths) {
  const list = readList(paths);
  if (!list.length) return;
  if (win && !win.webContents.isLoading()) win.webContents.send('open-files', list);
  else pending.push(...list);
}

async function openDialog() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Chọn file log FinishedJobs',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'File log (*.txt, *.log)', extensions: ['txt', 'log'] },
      { name: 'Tất cả file', extensions: ['*'] }
    ]
  });
  if (!r.canceled) sendFiles(r.filePaths);
}

function argFiles(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter(a => !a.startsWith('-') && fs.existsSync(a));
}

const isMac = process.platform === 'darwin';

function buildMenu() {
  const tpl = [
    ...(isMac ? [{ label: app.name, submenu: [
      { label: `Giới thiệu ${app.name}`, click: showAbout },
      { type: 'separator' },
      { label: 'Ẩn', role: 'hide' }, { label: 'Ẩn ứng dụng khác', role: 'hideOthers' }, { label: 'Hiện tất cả', role: 'unhide' },
      { type: 'separator' },
      { label: `Thoát ${app.name}`, role: 'quit' }
    ]}] : []),
    { label: 'Tệp', submenu: [
      { label: 'Mở file log…', accelerator: 'CmdOrCtrl+O', click: openDialog },
      { label: 'Dùng dữ liệu mẫu', click: () => win.webContents.send('cmd', 'sample') },
      { label: 'Xoá tất cả file đang mở', click: () => win.webContents.send('cmd', 'clear') },
      { type: 'separator' },
      { label: 'In / Lưu PDF…', accelerator: 'CmdOrCtrl+P', click: () => win.webContents.print({ printBackground: true }) },
      ...(isMac ? [] : [{ type: 'separator' }, { label: 'Thoát', role: 'quit' }])
    ]},
    ...(isMac ? [{ label: 'Sửa', submenu: [
      { label: 'Hoàn tác', role: 'undo' }, { label: 'Làm lại', role: 'redo' }, { type: 'separator' },
      { label: 'Cắt', role: 'cut' }, { label: 'Sao chép', role: 'copy' }, { label: 'Dán', role: 'paste' }, { label: 'Chọn tất cả', role: 'selectAll' }
    ]}] : []),
    { label: 'Xem', submenu: [
      { label: 'Tải lại', role: 'reload' },
      { type: 'separator' },
      { label: 'Phóng to', role: 'zoomIn' },
      { label: 'Thu nhỏ', role: 'zoomOut' },
      { label: 'Cỡ chữ mặc định', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Toàn màn hình', role: 'togglefullscreen' },
      { label: 'Công cụ nhà phát triển', role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' }
    ]},
    { label: 'Trợ giúp', submenu: [
      { label: 'Giới thiệu', click: showAbout }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function showAbout() {
  dialog.showMessageBox(win, {
    type: 'info', title: 'LabLog Analyzer',
    message: `LabLog Analyzer ${app.getVersion()}`,
    detail: 'Phân tích log FinishedJobs của máy xét nghiệm miễn dịch.\nDữ liệu chỉ được xử lý trên máy này, không gửi đi đâu.\n\n' +
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'LabLog Analyzer',
    ...(isMac ? {} : { icon: path.join(__dirname, 'app', 'icon.ico') }),
    backgroundColor: '#F3F6F6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.on('did-finish-load', () => {
    if (pending.length) win.webContents.send('open-files', pending.splice(0));
  });
  // Liên kết ngoài mở bằng trình duyệt mặc định
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    sendFiles(argFiles(argv));
  });
  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    sendFiles(argFiles(process.argv));
  });
  app.on('window-all-closed', () => app.quit());
  // macOS: mở file bằng cách kéo vào biểu tượng Dock hoặc "Open With" trong Finder
  app.on('open-file', (e, p) => { e.preventDefault(); if (app.isReady()) sendFiles([p]); else pending.push(...readList([p])); });
}

ipcMain.handle('open-dialog', openDialog);
