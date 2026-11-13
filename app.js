// M-Test 検査トレーニング PWA
'use strict';

const APP_VERSION = 'v1.2';   // 合流（マージ）のたびに上げる。GitHub の版の名前（タグ）と同じにする

// ---------- 保存領域 ----------
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

function guessDevice() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Androidスマホ' : 'Androidタブレット';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Macintosh/.test(ua)) return 'Mac';
  return '端末';
}
function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

let deviceId = store.get('mt_device_id', null);
if (!deviceId) { deviceId = uid(); store.set('mt_device_id', deviceId); }

// スプレッドシート（Apps Script）の送信先。手順3でここにURLを入れると、設定画面のURL欄は表示されなくなる
const APP_GAS_URL = 'https://script.google.com/macros/s/AKfycbzPOjYiDD-MHlkTWTL9h4McpguTT2pT-dGje3qWexJTVR_NSmx_Awj5f8lHyA871aH5/exec';

let settings = Object.assign({ examiner: '', deviceName: guessDevice(), gasUrl: '', token: '', unlocked: false }, store.get('mt_settings', {}));
if (APP_GAS_URL) settings.gasUrl = APP_GAS_URL;
let gateReason = '';      // 合言葉画面を出す理由：'' 初回 / 'changed' 合言葉が変わった / 'change' 自分で変更
let gateReturn = 'basic'; // 合言葉が通った後に戻る画面
let records = store.get('mt_records', {});   // id -> record（_pending: 未送信）
// v1.1 以前の記録の「股」「膝」を、まとめた部位「股・膝」に読み替える（どちらかを検査していれば検査済）
function normParts(r) {
  if (!r?.parts || !('hip' in r.parts || 'knee' in r.parts)) return;
  if (r.parts.hip || r.parts.knee) r.parts.hipknee = true;
  delete r.parts.hip; delete r.parts.knee;
}
Object.values(records).forEach(normParts);
let rec = newRecord();
let dirty = false;
let editorName = '';   // 修正するときの修正者名（初期値は設定の検査者名）
let view = 'basic';

function newRecord() {
  return {
    id: uid(), revision: 0,
    createdAt: '', createdBy: '', createdDevice: '',
    updatedAt: '', updatedBy: '', updatedDevice: '', updatedDeviceId: '',
    basic: { name: '', age: '', sex: '', hand: '', foot: '', sport: '', position: '',
             injury: '', injuryPlace: '', injuryState: '',   // ケガの有無などは v1.2 で入力をやめた（以前の記録のために残す）
             job: '', jobMemo: '', complaint: '', history: '' },
    parts: {},   // partId -> true（検査済）
    checks: {},  // itemKey -> true
    painBefore: '',  // NRS 0〜10（主訴の痛み。基本データで入力）。'' は未選択
    painAfter: '',   // NRS 0〜10（ケア後の痛み）
    care: [],
    carePoints: {},  // group -> ['太淵', 'その他', ...]
    careOther: {},   // group -> その他の経穴・対応（記述）
  };
}

// ---------- ケア経穴の選択 ----------
const CARE_OTHER = 'その他';
const pointName = p => p.replace(/^[\u2460-\u2473\u3251-\u325F]/, '');   // 先頭の丸数字を除く
const careChoices = g => [...CARE[g].flatMap(c => c.points.map(pointName)), CARE_OTHER];
const carePts = (r, g) => (r.carePoints?.[g] || []);
function careSummary(r, g) {
  const pts = carePts(r, g).filter(x => x !== CARE_OTHER);
  if (carePts(r, g).includes(CARE_OTHER)) pts.push(`その他（${r.careOther?.[g] || '記述なし'}）`);
  return pts.join('・');
}

// ---------- 画面共通 ----------
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gtag = g => `<span class="gtag" style="background:${GROUPS[g].color}">${g}</span>`;

// アプリ内の確認ダイアログ（ブラウザ標準の confirm は環境によって表示されないため使わない）
// buttons: [{ label, value, style }]。押したボタンの value を返す（背景・やめるは null）
function ask(message, buttons = [{ label: 'OK', value: true, style: 'primary' }]) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <p>${esc(message).replace(/\n/g, '<br>')}</p>
      <div class="modal-btns">
        ${buttons.map((b, i) => `<button class="btn ${b.style || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        <button class="btn" data-i="-1">やめる</button>
      </div></div>`;
    const close = v => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      if (e.target === wrap) return close(null);
      const b = e.target.closest('button[data-i]');
      if (b) close(b.dataset.i === '-1' ? null : buttons[+b.dataset.i].value);
    });
    document.body.appendChild(wrap);
    wrap.querySelector('.btn').focus();
  });
}
const askYes = (message, label = 'OK', style = 'primary') => ask(message, [{ label, value: true, style }]).then(v => v === true);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 2400);
}
function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const STEP_OF = { basic: 1, parts: 2, part: 2, list: 3, care: 3, done: 4 };
function renderSteps() {
  const cur = STEP_OF[view.split(':')[0]] || 0;
  $('#steps').innerHTML = ['1 基本データ', '2 検査部位', '3 一覧・ケア', '4 保存']
    .map((s, i) => `<span class="st ${cur === i + 1 ? 'on' : ''}">${s}</span>`).join('');
  const n = Object.values(records).filter(r => r._pending).length;
  $('#sync').textContent = n ? `未送信 ${n}件` : '';
}

function go(v) {
  if (!settings.unlocked && v !== 'gate') { gateReturn = v; v = 'gate'; }   // 合言葉が通るまで他の画面は出さない
  view = v;
  const [name, arg] = v.split(':');
  (VIEWS[name] || VIEWS.basic)(arg);
  renderSteps();
  window.scrollTo(0, 0);
}

// ---------- 1. 基本データ ----------
const SEG = {
  sex: ['男性', '女性', 'その他'],
  hand: ['右', '左', '両'],
  foot: ['右', '左', '両'],
};
function segHtml(key) {
  return `<div class="seg" data-seg="${key}">${SEG[key].map(o =>
    `<button type="button" class="${rec.basic[key] === o ? 'on' : ''}" data-val="${o}">${o}</button>`).join('')}</div>`;
}
function field(key, label, opt = {}) {
  const v = esc(rec.basic[key]);
  const input = opt.textarea
    ? `<textarea data-b="${key}" placeholder="${opt.ph || ''}">${v}</textarea>`
    : `<input data-b="${key}" value="${v}" type="${opt.type || 'text'}" ${opt.type === 'number' ? 'inputmode="numeric" min="0" max="120"' : ''} placeholder="${opt.ph || ''}">`;
  return `<div class="field ${opt.full ? 'full' : ''}"><label>${label}${opt.req ? ' <span class="req">*</span>' : ''}</label>${input}</div>`;
}

// スポーツ種目・ポジション（選択式。「その他」は自由入力）
const OTHER = '__other__';
let otherMode = { sport: false, position: false };
function syncOtherMode() {
  const b = rec.basic, pos = SPORTS[b.sport];
  otherMode = {
    sport: !!b.sport && !(b.sport in SPORTS),
    position: !!b.position && !!pos && !pos.includes(b.position),
  };
}
function selectHtml(key, list, cur, other) {
  const opts = list.map(o => `<option value="${esc(o)}" ${!other && cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
  return `<select data-sel="${key}">
    <option value="" ${!cur && !other ? 'selected' : ''}>選択してください</option>${opts}
    <option value="${OTHER}" ${other ? 'selected' : ''}>その他（入力）</option></select>`;
}
function sportHtml() {
  const b = rec.basic;
  const positions = otherMode.sport ? null : SPORTS[b.sport];
  const posField = positions && positions.length
    ? selectHtml('position', positions, b.position, otherMode.position) +
      (otherMode.position ? `<input data-b="position" value="${esc(b.position)}" placeholder="ポジションを入力" style="margin-top:6px">` : '')
    : `<input data-b="position" value="${esc(b.position)}" placeholder="${b.sport || otherMode.sport ? '例：階級・種目など（任意）' : '先に種目を選択'}">`;
  return `
    <div class="field"><label>スポーツ種目</label>${selectHtml('sport', Object.keys(SPORTS), b.sport, otherMode.sport)}
      ${otherMode.sport ? `<input data-b="sport" value="${esc(b.sport)}" placeholder="種目を入力" style="margin-top:6px">` : ''}</div>
    <div class="field"><label>ポジション</label>${posField}</div>`;
}

// 年齢は押すと数字の一覧から選ぶ（iPad/iPhoneでは選択ホイール）
const AGE_MIN = 5, AGE_MAX = 99;
function ageHtml(cur) {
  const ages = Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => String(AGE_MIN + i));
  if (cur && !ages.includes(String(cur))) ages.unshift(String(cur));   // 以前に入力した範囲外の値も残す
  return `<select data-b="age">
    <option value="" ${cur ? '' : 'selected'}>選択してください</option>
    ${ages.map(a => `<option value="${a}" ${String(cur) === a ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
}

// 職業は一覧から選ぶ（一覧にないときは「その他」を選び、職業メモに書く）
function jobHtml(cur) {
  const list = cur && !OCCUPATIONS.includes(cur) ? [cur, ...OCCUPATIONS] : OCCUPATIONS;
  return `<select data-b="job">
    <option value="" ${cur ? '' : 'selected'}>選択してください</option>
    ${list.map(o => `<option value="${esc(o)}" ${cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
}

const VIEWS = {};

// ---------- はじめに（合言葉） ----------
VIEWS.gate = () => {
  const msg = {
    '': '合言葉を知っている人だけが使えます。最初に一度だけ入力してください。',
    changed: '合言葉が変わりました。新しい合言葉を入力してください。<br>未送信のデータは消えていません。入力すると送信されます。',
    change: '新しい合言葉を入力してください。',
  }[gateReason];
  app.innerHTML = `
    <div class="gate">
      <h1>${gateReason ? '合言葉の入力' : 'はじめに'}</h1>
      <p class="lead">${msg}</p>
      <div class="card form">
        ${APP_GAS_URL ? '' : `<div class="field full"><label>スプレッドシート連携URL <span class="req">*</span></label><input id="g-url" value="${esc(settings.gasUrl)}" placeholder="https://script.google.com/macros/s/……/exec" inputmode="url" autocomplete="off"></div>`}
        <div class="field full"><label>合言葉 <span class="req">*</span></label><input id="g-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><label>検査者名 <span class="req">*</span></label><input id="g-examiner" value="${esc(settings.examiner)}" placeholder="例：山田 太郎"></div>
        <div class="field"><label>デバイス名 <span class="req">*</span></label><input id="g-device" value="${esc(settings.deviceName)}" placeholder="例：iPad-1"></div>
        <div class="full gate-err" id="g-err" role="alert"></div>
      </div>
      <div class="actionbar">
        <span class="spacer"></span>
        <button class="btn primary" data-action="unlock">はじめる</button>
      </div>
    </div>`;
  $('#g-token').addEventListener('keydown', e => { if (e.key === 'Enter') $('[data-action="unlock"]').click(); });
};

async function unlock(btn) {
  const err = m => { $('#g-err').textContent = m; };
  const url = APP_GAS_URL || $('#g-url').value.trim();
  const token = $('#g-token').value.trim(), ex = $('#g-examiner').value.trim(), dv = $('#g-device').value.trim();
  if (!url) return err('スプレッドシート連携URLを入力してください');
  if (!token) return err('合言葉を入力してください');
  if (!ex || !dv) return err('検査者名とデバイス名を入力してください');
  if (!navigator.onLine) return err('初回はインターネット接続が必要です。つながる場所でもう一度お試しください。');
  btn.disabled = true; btn.textContent = '確認中…'; err('');
  try {
    await pingRemote(url, token);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'はじめる';
    return err(e.auth ? '合言葉が違います' : '確認できませんでした。インターネット接続とURLを確かめてください。');
  }
  settings = { ...settings, gasUrl: url, token, examiner: ex, deviceName: dv, unlocked: true };
  store.set('mt_settings', settings);
  toast(gateReason ? '合言葉を登録しました' : `ようこそ、${ex} さん`);
  gateReason = '';
  syncPending();
  go(gateReturn === 'gate' ? 'basic' : gateReturn);
}

function lockDevice(reason, back = view) {
  settings = { ...settings, token: '', unlocked: false };
  store.set('mt_settings', settings);
  gateReason = reason;
  go(back === 'gate' ? 'basic' : back);   // 合言葉が通ったらこの画面に戻る
}
VIEWS.basic = () => {
  syncOtherMode();
  const b = rec.basic;
  app.innerHTML = `
    ${editingBanner()}
    <h1>1. 基本データの入力</h1>
    <p class="lead">検査者：<b>${esc(settings.examiner) || '未設定'}</b>（${esc(settings.deviceName)}）</p>
    <div class="card form">
      ${rec.revision ? `<div class="field full editor-field"><label>修正者名 <span class="req">*</span></label><input id="editor" value="${esc(editorName)}" placeholder="修正する人の名前"></div>` : ''}
      ${field('name', '氏名', { req: true })}
      <div class="field"><label>年齢（歳）</label>${ageHtml(b.age)}</div>
      <div class="field"><label>性別</label>${segHtml('sex')}</div>
      <div class="field"><label>利き腕</label>${segHtml('hand')}</div>
      <div class="field col2"><label>利き脚</label>${segHtml('foot')}</div>
      <div class="field"><label>職業</label>${jobHtml(b.job)}</div>
      <div class="field"><label>職業メモ（具体的な業務など）</label><input data-b="jobMemo" value="${esc(b.jobMemo)}" placeholder="例：一日中パソコン作業、重い荷物の運搬"></div>
      <div class="full form" id="sport-block" style="padding:0">${sportHtml()}</div>
      ${field('complaint', '主訴', { textarea: true, full: true, ph: '例：投球時に右肩の前が痛む' })}
      ${field('history', '既往歴', { textarea: true, full: true })}
      <div class="full">${nrsHtml('painBefore', '主訴の状況（痛み）')}</div>
    </div>
    <div class="actionbar">
      ${dirty || rec.revision ? '<button class="btn warn" data-action="discard">入力を破棄</button>' : ''}
      <span class="spacer"></span>
      <button class="btn primary" data-action="to-parts">次へ：検査部位の選択 →</button>
    </div>`;
  markFilled();
};

// 入力が終わった欄に色を付ける（基本データ）
function markFilled() {
  app.querySelectorAll('.form .field').forEach(f => {
    const seg = f.querySelector('.seg');
    const ctrls = [...f.querySelectorAll('input, select, textarea')];
    const done = seg ? !!seg.querySelector('button.on')
      : ctrls.length > 0 && ctrls.some(c => c.value.trim() && c.value !== OTHER);
    f.classList.toggle('filled', done);
  });
}

// ---------- NRS（痛みの強さ 0〜10） ----------
function nrsHtml(key, title) {
  const v = rec[key], set = v !== '' && v != null;
  return `<div class="card nrs ${set ? 'set' : ''}" data-nrs-box="${key}">
    <div class="nrs-head"><span class="nrs-title">${title} <span class="req">*</span></span>
      <span class="nrs-val" data-nrs-val="${key}">${set ? `NRS <b>${v}</b>` : '未選択'}</span></div>
    <p class="note nrs-help">${set ? '' : 'スライダーを動かして 0〜10 で選んでください（必須）'}</p>
    <input type="range" class="nrs-range" data-nrs="${key}" min="0" max="10" step="1" value="${set ? v : 5}" aria-label="${title}（NRS 0〜10）">
    <div class="nrs-ticks">${Array.from({ length: 11 }, (_, i) => `<span>${i}</span>`).join('')}</div>
    <div class="nrs-ends"><span>0 痛みなし</span><span>10 想像できる最大の痛み</span></div>
  </div>`;
}
function setNrs(el) {
  const key = el.dataset.nrs, v = Number(el.value);
  if (rec[key] === v) return;
  rec[key] = v; dirty = true;
  const box = el.closest('.nrs');
  box.classList.add('set');
  box.querySelector('[data-nrs-val]').innerHTML = `NRS <b>${v}</b>`;
  box.querySelector('.nrs-help').textContent = '';
}
function needNrs(key, msg) {
  if (rec[key] !== '' && rec[key] != null) return false;
  toast(msg);
  const box = $(`[data-nrs-box="${key}"]`);
  if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); box.classList.add('alert'); setTimeout(() => box.classList.remove('alert'), 1600); }
  return true;
}

function editingBanner() {
  return rec.revision
    ? `<div class="editing">修正中：${esc(rec.basic.name)}（検査 ${fmt(rec.createdAt)} ${esc(rec.createdBy)}／これまでの保存 ${rec.revision}回）</div>`
    : '';
}

// ---------- 2. 検査部位の選択 ----------
function partHits(p) {
  return p.moves.flatMap(itemsOfMove).filter(i => rec.checks[i.key]).length;
}
VIEWS.parts = () => {
  const row = (body, label) => `
    <div class="part-row"><div class="label">${label}</div><div class="part-btns">
      ${PARTS.filter(p => p.body === body).map(p => {
        const done = rec.parts[p.id], n = partHits(p);
        return `<button class="part-btn ${body} ${done ? 'done' : ''}" data-part="${p.id}">
          ${p.name}${done ? `<span class="cnt">✓${n}</span><span class="badge">検査済</span>` : ''}</button>`;
      }).join('')}
    </div></div>`;
  const doneCount = PARTS.filter(p => rec.parts[p.id]).length;
  app.innerHTML = `
    ${editingBanner()}
    <h1>2. 検査部位の選択</h1>
    <p class="lead">どの部位を検査しますか？（${esc(rec.basic.name)}さん・検査済 ${doneCount}/${PARTS.length}）</p>
    <div class="card part-rows">${row('upper', '上半身')}${row('lower', '下半身')}</div>
    <div class="legend">
      <span><i style="background:var(--upper)"></i>上半身（未検査）</span>
      <span><i style="background:var(--lower)"></i>下半身（未検査）</span>
      <span><i style="background:var(--done)"></i>検査済（右上の数字＝チェック数）</span>
    </div>
    <div class="actionbar">
      <button class="btn" data-go="basic">← 基本データ</button>
      <span class="spacer"></span>
      <button class="btn primary" data-action="to-list" ${doneCount ? '' : 'disabled'}>検査終了 → 3へ</button>
    </div>`;
};

// ---------- 2.x 部位ごとのチェック ----------
VIEWS.part = (pid) => {
  const p = PARTS.find(x => x.id === pid);
  const chk = (key, label) => `<button class="chk ${rec.checks[key] ? 'on' : ''}" data-chk="${key}">
      <span class="box">${rec.checks[key] ? '✓' : ''}</span>${label}</button>`;
  const moveCard = m => `
        <div class="move">
          <h3>${gtag(m.g)}${m.name}</h3>
          <img src="img/${m.id}.jpg" alt="${m.name}のイラスト" loading="lazy">
          <div class="desc">${m.desc}</div>
          <div class="checks">${m.lr ? chk(m.id + '_L', '左') + chk(m.id + '_R', '右') : chk(m.id, 'チェック')}</div>
        </div>`;
  app.innerHTML = `
    <h1>${p.body === 'upper' ? '上半身' : '下半身'}・${p.name}</h1>
    <p class="lead">該当する動作にチェックしてください。終わったら「検査終了」を押します。</p>
    ${p.cols
      ? `<div class="move-cols">${p.cols.map(col => `<div class="move-col">${col.map(id => moveCard(p.moves.find(m => m.id === id))).join('')}</div>`).join('')}</div>`
      : `<div class="moves">${p.moves.map(moveCard).join('')}</div>`}
    <div class="actionbar">
      <button class="btn" data-go="parts">← 戻る</button>
      ${rec.parts[pid] ? `<button class="btn warn" data-action="untest" data-pid="${pid}">未検査に戻す</button>` : ''}
      <span class="spacer"></span>
      <button class="btn primary" data-action="part-done" data-pid="${pid}">検査終了 → 2へ</button>
    </div>`;
};

// ---------- 3. データ一覧・ケア部位 ----------
function groupHits(g) { return GROUP_ITEMS[g].filter(i => rec.checks[i.key] && rec.parts[i.move.part]).length; }
function itemValue(r, i) {
  if (!r.parts[i.move.part]) return '未検査';
  return r.checks[i.key] ? '✓' : '－';
}
VIEWS.list = () => {
  const counts = Object.fromEntries(Object.keys(GROUPS).map(g => [g, groupHits(g)]));
  const max = Math.max(...Object.values(counts));
  app.innerHTML = `
    ${editingBanner()}
    <h1>3. データ一覧</h1>
    <div class="status-chips">
      ${PARTS.map(p => `<span class="chip ${rec.parts[p.id] ? 'ok' : 'no'}">${p.name}：${rec.parts[p.id] ? '検査済' : '未検査'}</span>`).join('')}
    </div>
    <div class="tables">
      ${Object.keys(GROUPS).map(g => `
        <div class="gtable">
          <div class="ghead" style="background:${GROUPS[g].color}"><span>${g}</span><span>チェック ${counts[g]}</span></div>
          <table>${GROUP_ITEMS[g].map((i, n, arr) => {
            const v = itemValue(rec, i);
            const first = n > 0 && arr[n - 1].move.id !== i.move.id;   // 動作が変わる行に太線
            return `<tr class="${v === '未検査' ? 'untested' : v === '✓' ? 'hit' : ''} ${first ? 'newmove' : ''}"><td>${i.label}</td><td class="v">${v}</td></tr>`;
          }).join('')}</table>
        </div>`).join('')}
    </div>
    <h2>ケア部位の選択</h2>
    <p class="lead">ケアする部位を選んでください（複数可）。★はチェック数が最も多い部位です。</p>
    <div class="care-pick">
      ${Object.keys(GROUPS).map(g => `<button class="care-btn ${rec.care.includes(g) ? 'on' : ''}" data-care="${g}" style="background:${GROUPS[g].color}">
        ${g}${max > 0 && counts[g] === max ? '<span class="star">★</span>' : ''}<small>チェック ${counts[g]}</small></button>`).join('')}
    </div>
    <div class="actionbar">
      <button class="btn" data-go="parts">← 再チェック（2へ）</button>
      <span class="spacer"></span>
      <button class="btn primary" data-go="care" ${rec.care.length ? '' : 'disabled'}>ケアする経穴を表示 →</button>
    </div>`;
};

// ---------- 3.x ケアする経穴 ----------
VIEWS.care = () => {
  const gs = Object.keys(GROUPS).filter(g => rec.care.includes(g));
  app.innerHTML = `
    <h1>ケアする経穴の表示</h1>
    ${gs.map(g => `
      <div class="care-group">
        <div class="gh">${gtag(g)} ケア部位 ${g}</div>
        <div class="meridians">
          ${CARE[g].map(c => `<div class="meridian"><h3>${c.meridian}</h3><div class="pts">${c.points.join('・')}</div>
            <img src="img/${c.img}.jpg" alt="${c.meridian}の経穴" loading="lazy"></div>`).join('')}
        </div>
        <div class="pick-pts">
          <div class="pick-title">選択した経穴 <small>（複数可）</small></div>
          <div class="pt-grid">
            ${careChoices(g).map(n => {
              const on = carePts(rec, g).includes(n);
              return `<button class="chk ${on ? 'on' : ''}" data-cpt="${g}|${n}"><span class="box">${on ? '✓' : ''}</span>${n}</button>`;
            }).join('')}
          </div>
          <div class="other-box" data-other-box="${g}" ${carePts(rec, g).includes(CARE_OTHER) ? '' : 'hidden'}>
            <label>その他の経穴・対応（${g}）</label>
            <textarea data-cother="${g}" rows="2" placeholder="例：合谷、ストレッチ指導 など">${esc(rec.careOther?.[g] || '')}</textarea>
          </div>
        </div>
      </div>`).join('')}
    ${nrsHtml('painAfter', 'ケア後の痛みの状況')}
    <div class="actionbar">
      <button class="btn" data-go="list">← データ一覧</button>
      <span class="spacer"></span>
      <button class="btn primary" data-action="save">4. データを保存 →</button>
    </div>`;
};

// ---------- 4. 保存・終了 ----------
VIEWS.done = () => {
  const r = rec;
  const tested = PARTS.filter(p => r.parts[p.id]).map(p => p.name);
  const untested = PARTS.filter(p => !r.parts[p.id]).map(p => p.name);
  const pending = records[r.id]?._pending;
  app.innerHTML = `
    <div class="card done-hero">
      <div class="big">${pending ? '📥' : '✅'}</div>
      <h1>${pending ? '端末に保存しました' : 'スプレッドシートに保存しました'}</h1>
      <p class="note">${pending
        ? (settings.gasUrl ? '通信できなかったため未送信です。オンライン時に自動で再送信します。' : 'スプレッドシートの送信先が未設定です。「設定」から登録すると送信されます。')
        : `${r.revision > 1 ? '修正内容で上書きしました。' : '新規データとして登録しました。'}`}</p>
    </div>
    <h2>保存内容</h2>
    <div class="card"><dl class="summary-grid">
      <dt>氏名</dt><dd>${esc(r.basic.name)}</dd>
      <dt>検査者</dt><dd>${esc(r.createdBy)}（${esc(r.createdDevice)}）</dd>
      ${r.revision > 1 ? `<dt>修正者</dt><dd>${esc(r.updatedBy)}（${esc(r.updatedDevice)}）</dd>` : ''}
      <dt>検査した部位</dt><dd>${tested.join('・') || 'なし'}</dd>
      <dt>検査しない部位</dt><dd>${untested.join('・') || 'なし'}</dd>
      <dt>職業</dt><dd>${esc(r.basic.job) || '未入力'}${r.basic.jobMemo ? `（${esc(r.basic.jobMemo)}）` : ''}</dd>
      <dt>主訴</dt><dd>${esc(r.basic.complaint) || 'なし'}</dd>
      <dt>痛み（NRS）</dt><dd>主訴 ${esc(r.painBefore)} → ケア後 ${esc(r.painAfter)}</dd>
      <dt>チェック数</dt><dd>${Object.keys(GROUPS).map(g => `${g}:${GROUP_ITEMS[g].filter(i => itemValue(r, i) === '✓').length}`).join(' ／ ')}</dd>
      <dt>ケア部位</dt><dd>${r.care.join('・') || 'なし'}</dd>
      ${r.care.map(g => `<dt>ケア経穴 ${g}</dt><dd>${esc(careSummary(r, g)) || '未選択'}</dd>`).join('')}
    </dl></div>
    <div class="actionbar">
      <button class="btn" data-action="edit-current">この記録を修正</button>
      <span class="spacer"></span>
      <button class="btn primary" data-action="finish">終了（次の入力へ）</button>
    </div>`;
};

async function saveRecord() {
  const now = new Date().toISOString();
  if (!rec.createdAt) {
    rec.createdAt = now; rec.createdBy = settings.examiner; rec.createdDevice = settings.deviceName;
  }
  rec.updatedAt = now; rec.updatedBy = rec.revision ? editorName.trim() : settings.examiner;   // 修正のときは入力された修正者名
  rec.updatedDevice = settings.deviceName; rec.updatedDeviceId = deviceId;
  rec.revision = (rec.revision || 0) + 1;
  // 選択を外したケア部位の経穴は保存しない
  const cp = {}, co = {};
  rec.care.forEach(g => {
    if (carePts(rec, g).length) cp[g] = carePts(rec, g);
    if (carePts(rec, g).includes(CARE_OTHER) && rec.careOther?.[g]?.trim()) co[g] = rec.careOther[g].trim();
  });
  rec.carePoints = cp; rec.careOther = co;
  records[rec.id] = { ...structuredClone(rec), _pending: true };
  store.set('mt_records', records);
  dirty = false;
  await syncPending();
  go('done');
}

// ---------- スプレッドシート連携（Google Apps Script） ----------
function sheetHeaders() {
  return ['レコードID', '検査日時', '検査者', '検査デバイス', '修正日時', '修正者', '修正デバイス', 'デバイスID', '修正回数',
    '氏名', '年齢', '性別', '利き腕', '利き脚', 'スポーツ種目', 'ポジション', 'ケガの有無', 'ケガの場所', 'ケガの状態', '既往歴',
    '検査した部位', '検査しない部位', ...SHEET_PARTS.map(([n]) => `部位_${n}`),
    ...ALL_ITEMS.map(i => `${i.move.g}_${i.label}`),
    ...Object.keys(GROUPS).map(g => `チェック数_${g}`), 'ケア部位',
    ...Object.keys(GROUPS).flatMap(g => [`ケア経穴_${g}`, `その他記述_${g}`]),
    'NRS_主訴の痛み', 'NRS_ケア後の痛み', '主訴', '職業', '職業メモ'];   // 既存の列がずれないよう、新しい列は必ず右端に足す
}
function sheetRow(r) {
  const b = r.basic;
  return [r.id, fmt(r.createdAt), r.createdBy, r.createdDevice, fmt(r.updatedAt), r.updatedBy, r.updatedDevice, r.updatedDeviceId, r.revision,
    b.name, b.age, b.sex, b.hand, b.foot, b.sport, b.position, b.injury, b.injuryPlace, b.injuryState, b.history,
    PARTS.filter(p => r.parts[p.id]).map(p => p.name).join('・'),
    PARTS.filter(p => !r.parts[p.id]).map(p => p.name).join('・'),
    ...SHEET_PARTS.map(([, id]) => r.parts[id] ? '検査済' : '未検査'),
    ...ALL_ITEMS.map(i => itemValue(r, i)),
    ...Object.keys(GROUPS).map(g => GROUP_ITEMS[g].filter(i => itemValue(r, i) === '✓').length),
    r.care.join('・'),
    ...Object.keys(GROUPS).flatMap(g => [carePts(r, g).join('・'), carePts(r, g).includes(CARE_OTHER) ? (r.careOther?.[g] || '') : '']),
    r.painBefore ?? '', r.painAfter ?? '', b.complaint ?? '', b.job ?? '', b.jobMemo ?? ''];
}
function stripLocal(r) { const { _pending, ...rest } = r; return rest; }

async function postRecord(r) {
  const res = await fetch(settings.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // プリフライトを避ける
    body: JSON.stringify({ action: 'save', token: settings.token, id: r.id, headers: sheetHeaders(), values: sheetRow(r),
      who: r.updatedBy, device: r.updatedDevice, deviceId: r.updatedDeviceId, name: r.basic.name }),
  });
  const j = await res.json();
  if (!j.ok) throw Object.assign(new Error(j.error || '保存エラー'), { auth: j.error === '合言葉が違います' });
  return j;
}

let syncing = false;
async function syncPending() {
  if (!settings.gasUrl || !settings.unlocked || syncing || !navigator.onLine) { renderSteps(); return; }
  syncing = true;
  let failed = 0;
  for (const r of Object.values(records).filter(x => x._pending)) {
    try { await postRecord(r); delete records[r.id]._pending; store.set('mt_records', records); }
    catch (e) {
      if (e.auth) { syncing = false; lockDevice('changed'); return; }   // 合言葉が変わった
      failed++; console.warn('送信失敗', e);
    }
  }
  syncing = false;
  if (failed) toast(`${failed}件を送信できませんでした`);
  renderSteps();
}

// 接続確認（URLと合言葉が正しいかだけを確かめる。データは読み出さない）
async function pingRemote(url = settings.gasUrl, token = settings.token) {
  const u = new URL(url);
  u.searchParams.set('token', token);
  const j = await (await fetch(u)).json();
  if (!j.ok) throw Object.assign(new Error(j.error || '接続エラー'), { auth: j.error === '合言葉が違います' });
}

// ---------- 履歴（修正・Excel書き出し） ----------
const histSel = new Set();   // Excel書き出し用に選んだ記録ID
function histVisibleIds() {
  return [...document.querySelectorAll('.hist-item')].filter(el => !el.hidden).map(el => el.dataset.id);
}
function updateExportBar() {
  const btn = $('[data-action="export-xlsx"]');
  if (!btn) return;
  const n = histSel.size, vis = histVisibleIds().length;
  btn.textContent = n ? `選んだ ${n}件をExcelに書き出し` : `表示中の ${vis}件をExcelに書き出し`;
  btn.disabled = !n && !vis;
  $('[data-action="sel-all"]').textContent = vis && histVisibleIds().every(id => histSel.has(id)) ? '選択を解除' : 'すべて選択';
  const del = $('[data-action="del-local"]');
  const nLocal = [...histSel].filter(id => records[id]).length;
  del.textContent = nLocal ? `選んだ ${nLocal}件を端末から削除` : '端末から削除';
  del.disabled = !nLocal;
}

// ---------- 端末データの削除（スプレッドシートは削除しない） ----------
const STORAGE_LIMIT = 5 * 1024 * 1024;   // ブラウザの保存上限の目安（約5MB）
function storageUsage() {
  const bytes = (localStorage.getItem('mt_records') || '').length * 2;   // 文字数×2バイトで概算
  return { count: Object.keys(records).length, kb: Math.ceil(bytes / 1024), pct: Math.min(100, Math.round(bytes / STORAGE_LIMIT * 1000) / 10) };
}
async function deleteLocal(ids) {
  ids = ids.filter(id => records[id]);
  if (!ids.length) { toast('この端末に保存されている記録はありません'); return; }
  const pend = ids.filter(id => records[id]._pending);
  let target = ids;
  if (!pend.length) {
    if (!await askYes(`${ids.length}件をこの端末から削除します。\nスプレッドシートのデータは残りますが、削除した記録はアプリで修正・Excel書き出しができなくなります。`, '削除する', 'danger')) return;
  } else {
    const names = pend.slice(0, 5).map(id => records[id].basic?.name || '(氏名なし)').join('、') + (pend.length > 5 ? ' ほか' : '');
    const sent = ids.length - pend.length;
    const choice = await ask(
      `${ids.length}件をこの端末から削除します。\n\nこのうち未送信の記録が ${pend.length}件 あります（${names}）。\n未送信の記録はスプレッドシートに無いため、削除するとどこにも残りません。`,
      [{ label: `未送信も含めて${ids.length}件削除`, value: 'all', style: 'danger' },
       ...(sent ? [{ label: `送信済みの${sent}件だけ削除`, value: 'sent' }] : [])]);
    if (!choice) return;
    if (choice === 'sent') target = ids.filter(id => !records[id]._pending);
  }
  target.forEach(id => { delete records[id]; histSel.delete(id); });
  store.set('mt_records', records);
  toast(`${target.length}件をこの端末から削除しました`);
  go('history');
}
VIEWS.history = () => {
  const merged = { ...records };   // この端末に保存した記録だけを表示（スプレッドシートからは読み出さない）
  const list = Object.values(merged).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  app.innerHTML = `
    <h1>保存データ（履歴・修正）</h1>
    <p class="lead">この端末に保存したデータを表示しています。${settings.gasUrl ? '' : '（送信先未設定）'}</p>
    <input class="search" id="q" placeholder="氏名・種目・検査者・修正者で絞り込み">
    ${list.length ? `<div class="export-bar">
      <button class="btn" data-action="sel-all">すべて選択</button>
      <span class="spacer"></span>
      <button class="btn danger" data-action="del-local">端末から削除</button>
      <button class="btn excel" data-action="export-xlsx">Excelに書き出し</button>
    </div>` : ''}
    <div class="hist" id="hist">
      ${list.length ? list.map(r => `
        <div class="hist-item" data-id="${r.id}" data-q="${esc([r.basic?.name, r.basic?.sport, r.createdBy, r.updatedBy].join(' '))}">
          <button class="chk sel ${histSel.has(r.id) ? 'on' : ''}" data-hsel="${r.id}" aria-label="書き出しに選ぶ"><span class="box">${histSel.has(r.id) ? '✓' : ''}</span></button>
          <div class="main">
            <div class="name">${esc(r.basic?.name) || '(氏名なし)'}${r._pending ? '<span class="pill">未送信</span>' : ''}</div>
            <div class="meta">${esc(r.basic?.sport)} ${esc(r.basic?.position)}｜検査：${PARTS.filter(p => r.parts?.[p.id]).map(p => p.name).join('・') || 'なし'}｜ケア：${(r.care || []).join('・') || 'なし'}</div>
            <div class="meta">検査 ${fmt(r.createdAt)} ${esc(r.createdBy)}（${esc(r.createdDevice)}）／修正 ${fmt(r.updatedAt)} ${esc(r.updatedBy)}（${esc(r.updatedDevice)}）・${r.revision || 1}版</div>
          </div>
          <button class="btn" data-edit="${r.id}">修正</button>
        </div>`).join('') : '<p class="note">保存データはまだありません。</p>'}
    </div>
    ${(() => {
      const u = storageUsage(), sent = Object.values(records).filter(r => !r._pending).length;
      return `<div class="card storage">
        <div class="storage-head"><b>この端末の保存</b><span>${u.count}件・約${u.kb.toLocaleString()}KB（上限の約${u.pct}%）</span></div>
        <div class="meter"><span style="width:${Math.max(u.pct, u.count ? 1 : 0)}%"></span></div>
        <p class="note">送信済みのデータは、端末から削除してもスプレッドシートに残ります。ただし、削除した記録はアプリで修正・Excel書き出しができなくなります（修正はスプレッドシートで直接行います）。</p>
        <button class="btn danger" data-action="del-sent" ${sent ? '' : 'disabled'}>送信済みのデータをこの端末からすべて削除（${sent}件）</button>
      </div>`;
    })()}
    <div class="actionbar">
      <span class="spacer"></span>
      <button class="btn primary" data-go="basic">入力画面へ戻る</button>
    </div>`;
  $('#q').addEventListener('input', e => {
    const q = e.target.value.trim();
    document.querySelectorAll('.hist-item').forEach(el => { el.hidden = q && !el.dataset.q.includes(q); });
    updateExportBar();
  });
  app._histList = merged;
  [...histSel].forEach(id => { if (!merged[id]) histSel.delete(id); });
  updateExportBar();
};

async function openHistory() {
  if (dirty && !await askYes('入力中のデータは破棄されます。履歴を開きますか？', '履歴を開く')) return;
  loadExcelJS().catch(() => {});   // 書き出しをすぐ始められるよう先に読み込む
  go('history');
}

// ---------- 設定 ----------
VIEWS.settings = () => {
  app.innerHTML = `
    <h1>設定</h1>
    <p class="lead">誰が・どのデバイスで検査したかを記録するため、最初に設定してください。</p>
    <div class="card form">
      <div class="field"><label>検査者名 <span class="req">*</span></label><input id="s-examiner" value="${esc(settings.examiner)}" placeholder="例：山田 太郎"></div>
      <div class="field"><label>デバイス名 <span class="req">*</span></label><input id="s-device" value="${esc(settings.deviceName)}" placeholder="例：iPad-1"></div>
      ${APP_GAS_URL ? '' : `<div class="field full"><label>スプレッドシート連携URL（Google Apps Script のウェブアプリURL）</label><input id="s-url" value="${esc(settings.gasUrl)}" placeholder="https://script.google.com/macros/s/……/exec" inputmode="url"></div>`}
      <div class="field full"><label>合言葉</label>
        <div class="token-row"><span class="token-set">設定済み（●●●●）</span>
          <button class="btn" data-action="change-token">合言葉を変更</button>
          <button class="btn danger" data-action="lock">この端末をロック</button></div>
        <div class="note">ロックすると合言葉の入力画面に戻ります。入力済みのデータは消えません。</div></div>
      <div class="full note">バージョン：<b>${APP_VERSION}</b>　／　デバイスID：${esc(deviceId)}</div>
    </div>
    <div class="actionbar">
      ${settings.gasUrl ? '<button class="btn" data-action="test-conn">接続テスト</button>' : ''}
      <span class="spacer"></span>
      <button class="btn primary" data-action="save-settings">保存</button>
    </div>`;
};

// ---------- イベント ----------
app.addEventListener('input', e => {
  const k = e.target.dataset.b;
  if (k) { rec.basic[k] = e.target.value; dirty = true; markFilled(); }
  if (e.target.id === 'editor') { editorName = e.target.value; markFilled(); }
  if (e.target.dataset.nrs) setNrs(e.target);
  const og = e.target.dataset.cother;
  if (og) { rec.careOther = { ...rec.careOther, [og]: e.target.value }; dirty = true; }
});
app.addEventListener('change', e => {
  const key = e.target.dataset.sel;
  if (!key) return;
  const v = e.target.value;
  otherMode[key] = v === OTHER;
  rec.basic[key] = v === OTHER ? '' : v;
  if (key === 'sport') { rec.basic.position = ''; otherMode.position = false; }
  dirty = true;
  $('#sport-block').innerHTML = sportHtml();
  markFilled();
  if (v === OTHER) $(`#sport-block input[data-b="${key}"]`)?.focus();
});

document.addEventListener('click', async e => {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;

  if (d.go) return go(d.go);

  if (t.parentElement?.dataset.seg) {
    const key = t.parentElement.dataset.seg;
    rec.basic[key] = rec.basic[key] === d.val ? '' : d.val;
    dirty = true;
    t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === rec.basic[key]));
    markFilled();
    return;
  }
  if (d.part) return go('part:' + d.part);
  if (d.chk) {
    rec.checks[d.chk] = !rec.checks[d.chk];
    if (!rec.checks[d.chk]) delete rec.checks[d.chk];
    dirty = true;
    t.classList.toggle('on', !!rec.checks[d.chk]);
    t.querySelector('.box').textContent = rec.checks[d.chk] ? '✓' : '';
    return;
  }
  if (d.care) {
    rec.care = rec.care.includes(d.care) ? rec.care.filter(g => g !== d.care) : [...rec.care, d.care].sort();
    dirty = true;
    t.classList.toggle('on', rec.care.includes(d.care));
    $('[data-go="care"]').disabled = !rec.care.length;
    return;
  }
  if (d.cpt) {
    const [g, n] = d.cpt.split('|');
    rec.carePoints = rec.carePoints || {};
    const cur = carePts(rec, g);
    const next = cur.includes(n) ? cur.filter(x => x !== n) : careChoices(g).filter(x => cur.includes(x) || x === n);
    rec.carePoints[g] = next;
    dirty = true;
    const on = next.includes(n);
    t.classList.toggle('on', on);
    t.querySelector('.box').textContent = on ? '✓' : '';
    if (n === CARE_OTHER) {
      const box = $(`[data-other-box="${g}"]`);
      box.hidden = !on;
      if (on) box.querySelector('textarea').focus();
    }
    return;
  }
  if (d.hsel) {
    histSel.has(d.hsel) ? histSel.delete(d.hsel) : histSel.add(d.hsel);
    t.classList.toggle('on', histSel.has(d.hsel));
    t.querySelector('.box').textContent = histSel.has(d.hsel) ? '✓' : '';
    updateExportBar();
    return;
  }
  if (d.edit) {
    rec = structuredClone(stripLocal(app._histList[d.edit]));
    dirty = false; editorName = settings.examiner;
    toast(`${rec.basic.name} さんのデータを修正します`);
    return go('basic');
  }

  switch (d.action) {
    case 'home':
      if (dirty && !await askYes('入力中のデータを破棄して最初に戻りますか？', '最初に戻る', 'danger')) return;
      rec = newRecord(); dirty = false; go('basic');
      break;
    case 'history': openHistory(); break;
    case 'settings': go('settings'); break;
    case 'discard':
      if (await askYes('入力内容を破棄しますか？', '破棄する', 'danger')) { rec = newRecord(); dirty = false; go('basic'); }
      break;
    case 'to-parts':
      if (!settings.examiner) { toast('先に「設定」で検査者名を登録してください'); return go('settings'); }
      if (rec.revision && !editorName.trim()) { toast('修正者名を入力してください'); $('#editor').focus(); return; }
      if (!rec.basic.name.trim()) { toast('氏名を入力してください'); $('[data-b="name"]').focus(); return; }
      if (needNrs('painBefore', '「主訴の状況（痛み）」をNRSで選んでください')) return;
      go('parts'); break;
    case 'part-done':
      rec.parts[d.pid] = true; dirty = true; go('parts'); break;
    case 'untest':
      if (await askYes('この部位を未検査に戻します（チェックは残ります）。', '未検査に戻す')) { delete rec.parts[d.pid]; dirty = true; go('parts'); }
      break;
    case 'to-list': go('list'); break;
    case 'save':
      if (needNrs('painAfter', '「ケア後の痛みの状況」をNRSで選んでください')) return;
      if (rec.painBefore === '' || rec.painBefore == null) { toast('基本データの「主訴の状況（痛み）」をNRSで選んでください'); return go('basic'); }
      if (rec.revision && !editorName.trim()) { toast('修正者名を入力してください'); return go('basic'); }
      t.disabled = true; t.textContent = '保存中…';
      await saveRecord(); break;
    case 'edit-current':
      rec = structuredClone(stripLocal(records[rec.id])); editorName = settings.examiner; go('basic'); break;
    case 'finish':
      rec = newRecord(); dirty = false; go('basic'); break;
    case 'del-local': deleteLocal([...histSel]); break;
    case 'del-sent': deleteLocal(Object.values(records).filter(r => !r._pending).map(r => r.id)); break;
    case 'sel-all': {
      const ids = histVisibleIds(), all = ids.every(id => histSel.has(id));
      ids.forEach(id => all ? histSel.delete(id) : histSel.add(id));
      document.querySelectorAll('[data-hsel]').forEach(b => {
        const on = histSel.has(b.dataset.hsel);
        b.classList.toggle('on', on); b.querySelector('.box').textContent = on ? '✓' : '';
      });
      updateExportBar();
      break;
    }
    case 'export-xlsx': {
      const ids = histSel.size ? [...histSel] : histVisibleIds();
      const order = histVisibleIds().concat([...histSel]);
      const list = [...new Set(order)].filter(id => ids.includes(id)).map(id => stripLocal(app._histList[id]));
      const label = t.textContent;
      t.disabled = true; t.textContent = '作成中…';
      try {
        const res = await exportExcel(list);
        if (res !== 'cancel') toast(`${list.length}件をExcelに書き出しました`);
      } catch (err) { toast('書き出しに失敗しました：' + err.message); }
      t.disabled = false; t.textContent = label;
      break;
    }
    case 'save-settings': {
      const ex = $('#s-examiner').value.trim(), dv = $('#s-device').value.trim();
      if (!ex || !dv) return toast('検査者名とデバイス名を入力してください');
      settings = { ...settings, examiner: ex, deviceName: dv, gasUrl: APP_GAS_URL || $('#s-url').value.trim() };
      store.set('mt_settings', settings);
      toast('設定を保存しました');
      syncPending();
      go('basic'); break;
    }
    case 'unlock': await unlock(t); break;
    case 'change-token': lockDevice('change'); break;
    case 'lock':
      if (await askYes('この端末をロックします。\n次に使うときは合言葉の入力が必要です。入力済みのデータは消えません。', 'ロックする', 'danger')) {
        lockDevice('', 'basic'); toast('ロックしました');
      }
      break;
    case 'test-conn':
      try { await pingRemote(); toast('接続OK（送信できます）'); }
      catch (err) { toast('接続できません：' + err.message); }
      break;
  }
});

// つまみを動かさずにタップしただけでも、その値を選んだことにする
app.addEventListener('change', e => { if (e.target.dataset.nrs) setNrs(e.target); });
app.addEventListener('pointerup', e => { if (e.target.dataset?.nrs) setNrs(e.target); });

// 文字入力中（画面のキーボード表示中）は下のボタンを隠し、誤って押さないようにする
// iPad ではキーボードの「閉じる」ボタンを押しても入力欄が選ばれたままなので、
// 「入力欄が選ばれている」かつ「キーボードで画面の見える部分が縮んでいる」ときだけ隠す
const isTyping = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)));
// 画面の向き（幅）ごとに、これまでで一番大きかった「見えている高さ」を覚えておき、
// そこから大きく縮んでいればキーボードが出ていると判断する（ブラウザごとの違いに左右されにくい）
const vpMax = {};
function viewHeight() {
  const vv = window.visualViewport;
  return vv ? vv.height * vv.scale : window.innerHeight;
}
function keyboardShown() {
  const o = Math.round(window.innerWidth);   // 画面の幅ごと（＝縦向き・横向きごと）に覚える。幅はキーボードで変わらない
  const h = viewHeight();
  vpMax[o] = Math.max(vpMax[o] || 0, h);
  return vpMax[o] - h > 150;
}
keyboardShown();   // 起動時の高さを記録
function updateTyping() {
  document.body.classList.toggle('typing', isTyping(document.activeElement) && keyboardShown());
}
document.addEventListener('focusin', () => setTimeout(updateTyping, 50));
document.addEventListener('focusout', () => setTimeout(updateTyping, 100));   // 次の入力欄へ移るときは隠したまま
window.visualViewport?.addEventListener('resize', updateTyping);               // キーボードが出た・閉じた
window.addEventListener('resize', updateTyping);

window.addEventListener('online', syncPending);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncPending(); });
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW登録失敗', err));
}

go('basic');   // 合言葉が未登録なら「はじめに」画面になる
syncPending();
