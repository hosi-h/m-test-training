// Excel（.xlsx）書き出し。ExcelJS は vendor/ に同梱し、オフラインでも動く
// 「一覧」シート（1人1行・スプレッドシートと同じ列）＋ 1人1枚の個人シート

let excelJsLoading = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  return excelJsLoading ||= new Promise((ok, ng) => {
    const s = document.createElement('script');
    s.src = 'vendor/exceljs.min.js';
    s.onload = ok;
    s.onerror = () => { excelJsLoading = null; ng(new Error('Excelの部品を読み込めませんでした')); };
    document.head.appendChild(s);
  });
}

const XL = {
  argb: hex => 'FF' + hex.replace('#', '').toUpperCase(),
  fill: hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: XL.argb(hex) } }),
  thin: { style: 'thin', color: { argb: 'FFC9D1CC' } },
  get border() { return { top: XL.thin, left: XL.thin, bottom: XL.thin, right: XL.thin }; },
};

// セルの値に応じた色（✓=赤、未検査=灰、検査済=緑）
function styleValue(cell, v) {
  if (v === '✓') { cell.font = { bold: true, color: { argb: 'FFD0342C' } }; cell.fill = XL.fill('#FDE8E8'); }
  else if (v === '未検査') { cell.font = { color: { argb: 'FF9AA0A6' } }; cell.fill = XL.fill('#F1F3F4'); }
  else if (v === '検査済') { cell.font = { color: { argb: 'FF0B6B3C' } }; cell.fill = XL.fill('#E3F4EA'); }
}

// 列見出しが A〜F のどれに属するか（色分け用）
function groupOfHeader(h) {
  const m = h.match(/^(?:チェック数_|ケア経穴_|その他記述_)?([A-F])(?:_|$)/);
  return m ? m[1] : null;
}

function addListSheet(wb, list) {
  const headers = sheetHeaders();
  const ws = wb.addWorksheet('一覧', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(headers);
  const ageCol = headers.indexOf('年齢');
  list.forEach(r => {
    const v = sheetRow(r);
    if (/^\d+$/.test(v[ageCol] ?? '')) v[ageCol] = Number(v[ageCol]);   // 年齢は数値で出す（並べ替え・集計用）
    ws.addRow(v);
  });

  const head = ws.getRow(1);
  head.height = 48;
  head.eachCell((cell, col) => {
    const g = groupOfHeader(headers[col - 1]);
    cell.font = { bold: true, color: { argb: g ? 'FFFFFFFF' : 'FF1D2420' } };
    cell.fill = XL.fill(g ? GROUPS[g].color : '#E3F4EA');
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = XL.border;
  });
  for (let i = 2; i <= ws.rowCount; i++) {
    ws.getRow(i).eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > headers.length) return;
      cell.border = XL.border;
      const center = ['✓', '－', '未検査', '検査済'].includes(cell.value);
      cell.alignment = { vertical: 'middle', ...(center ? { horizontal: 'center' } : {}) };
      styleValue(cell, cell.value);
    });
  }
  headers.forEach((h, i) => {
    const longest = Math.max(h.length, ...list.map(r => String(sheetRow(r)[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(40, Math.max(8, longest * 1.6 + 2));
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

function sheetName(r, n, used) {
  let base = `${n}_${(r.basic?.name || '氏名なし')}`.replace(/[\[\]:*?\/\\]/g, '').slice(0, 28);
  let name = base, k = 2;
  while (used.has(name)) name = `${base.slice(0, 25)}(${k++})`;
  used.add(name);
  return name;
}

// 個人シート：基本データ → A〜F の表（3列×2段）→ ケア
function addPersonSheet(wb, r, name) {
  const ws = wb.addWorksheet(name, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  [24, 8, 2, 24, 8, 2, 24, 8].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const b = r.basic || {};
  const set = (row, col, v, style = {}) => { const c = ws.getCell(row, col); c.value = v; Object.assign(c, style); return c; };

  set(1, 1, 'M-Test 検査結果', { font: { bold: true, size: 16 } });
  set(1, 7, `出力 ${fmt(new Date().toISOString())}`, { font: { size: 9, color: { argb: 'FF5B6560' } } });

  const info = [
    ['氏名', b.name], ['年齢（歳）', /^\d+$/.test(b.age ?? '') ? Number(b.age) : b.age], ['性別', b.sex], ['利き腕', b.hand], ['利き脚', b.foot],
    ['スポーツ種目', b.sport], ['ポジション', b.position], ['ケガの有無', b.injury], ['ケガの場所', b.injuryPlace],
    ['ケガの状態', b.injuryState], ['既往歴', b.history],
    ['検査した部位', PARTS.filter(p => r.parts?.[p.id]).map(p => p.name).join('・') || 'なし'],
    ['検査しない部位', PARTS.filter(p => !r.parts?.[p.id]).map(p => p.name).join('・') || 'なし'],
    ['作成', `${fmt(r.createdAt)} ${r.createdBy || ''}（${r.createdDevice || ''}）`],
    ['更新', `${fmt(r.updatedAt)} ${r.updatedBy || ''}（${r.updatedDevice || ''}）・修正${r.revision || 1}回`],
  ];
  let row = 3;
  info.forEach(([k, v]) => {
    set(row, 1, k, { font: { bold: true, color: { argb: 'FF5B6560' } }, fill: XL.fill('#F4F7F5'), border: XL.border });
    ws.mergeCells(row, 2, row, 8);
    set(row, 2, v ?? '', { border: XL.border, alignment: { wrapText: true, vertical: 'middle', horizontal: 'left' } });
    row++;
  });

  // A〜F の表
  row += 1;
  const groups = Object.keys(GROUPS);
  [groups.slice(0, 3), groups.slice(3)].forEach(band => {
    const top = row;
    let bottom = row;
    band.forEach((g, bi) => {
      const col = 1 + bi * 3;
      const items = GROUP_ITEMS[g];
      const count = items.filter(i => itemValue(r, i) === '✓').length;
      const white = { bold: true, color: { argb: 'FFFFFFFF' } };
      set(top, col, g, { font: white, fill: XL.fill(GROUPS[g].color), border: XL.border });
      set(top, col + 1, `✓ ${count}`, { font: white, fill: XL.fill(GROUPS[g].color), border: XL.border, alignment: { horizontal: 'center' } });
      items.forEach((it, n) => {
        const rr = top + 1 + n;
        const newMove = n > 0 && items[n - 1].move.id !== it.move.id;   // 動作が変わる行に太線
        const border = { ...XL.border, ...(newMove ? { top: { style: 'medium', color: { argb: 'FF5B6560' } } } : {}) };
        const v = itemValue(r, it);
        set(rr, col, it.label, { border });
        const c = set(rr, col + 1, v, { border, alignment: { horizontal: 'center' } });
        styleValue(c, v);
        bottom = Math.max(bottom, rr);
      });
    });
    row = bottom + 2;
  });

  // ケア
  set(row, 1, 'ケア部位', { font: { bold: true, color: { argb: 'FF5B6560' } }, fill: XL.fill('#F4F7F5'), border: XL.border });
  ws.mergeCells(row, 2, row, 8);
  set(row, 2, (r.care || []).join('・') || 'なし', { border: XL.border });
  row++;
  (r.care || []).forEach(g => {
    set(row, 1, `ケア経穴 ${g}`, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: XL.fill(GROUPS[g].color), border: XL.border });
    ws.mergeCells(row, 2, row, 8);
    set(row, 2, careSummary(r, g) || '未選択', { border: XL.border, alignment: { wrapText: true } });
    row++;
  });
}

async function buildWorkbook(list) {
  await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.examiner || 'M-Test';
  wb.created = new Date();
  addListSheet(wb, list);
  const used = new Set(['一覧']);
  list.forEach((r, i) => addPersonSheet(wb, r, sheetName(r, i + 1, used)));
  return wb.xlsx.writeBuffer();
}

// iPad/iPhone は共有シート（「ファイル」に保存・AirDrop・メール）、それ以外はダウンロード
async function deliverFile(buf, name) {
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const file = new File([buf], name, { type });
  if (navigator.maxTouchPoints > 0 && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; }   // 共有できなければダウンロードへ
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return 'downloaded';
}

async function exportExcel(list) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `M-Test_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_${list.length}件.xlsx`;
  const buf = await buildWorkbook(list);
  return deliverFile(buf, name);
}
