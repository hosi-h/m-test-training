// M-Test マスターデータ（検査部位・動作・ケア経穴）

// ケア部位（A〜F）の表示色
const GROUPS = {
  A: { color: '#F47C7C' },
  B: { color: '#9A9400' },
  C: { color: '#00589A' },
  D: { color: '#F59300' },
  E: { color: '#00908F' },
  F: { color: '#0A9BFF' },
};

// 検査部位と動作。lr: true は左右を別々にチェックする動作
const PARTS = [
  { id: 'neck', name: '頸', body: 'upper', moves: [
    { id: 'neck_ext',  name: '頸後屈', g: 'A', lr: false, desc: 'あごをゆっくり上げる' },
    { id: 'neck_flex', name: '頸前屈', g: 'B', lr: false, desc: '胸に向けてあごをゆっくり下ろす' },
    { id: 'neck_lat',  name: '頸側屈', g: 'C', lr: true,  desc: '耳を肩にゆっくり近づける' },
  ]},
  { id: 'shoulder', name: '肩', body: 'upper', moves: [
    { id: 'sho_ext',   name: '肩伸展',     g: 'A', lr: true, desc: '上肢を後方にゆっくり上げる' },
    { id: 'sho_flex',  name: '肩屈曲',     g: 'B', lr: true, desc: '上肢を前からゆっくり上げる' },
    { id: 'sho_hflex', name: '肩水平屈曲', g: 'C', lr: true, desc: '肘を伸ばし上肢を水平にゆっくり反対側の方に近づける' },
    { id: 'sho_hext',  name: '肩水平伸展', g: 'C', lr: true, desc: '肘を伸ばし上肢を水平にゆっくり後方に引く' },
  ]},
  { id: 'elbow', name: '肘', body: 'upper', moves: [
    { id: 'elb_pro',  name: '肘回内', g: 'A', lr: true, desc: '肘を内側にゆっくり回す' },
    { id: 'elb_sup',  name: '肘回外', g: 'B', lr: true, desc: '肘を外側にゆっくり回す（ドアノブを回す）' },
    { id: 'elb_flex', name: '肘屈曲', g: 'C', lr: true, desc: '肘をゆっくり曲げる' },
    { id: 'elb_ext',  name: '肘伸展', g: 'C', lr: true, desc: '肘をゆっくり伸ばす' },
  ]},
  { id: 'wrist', name: '手首', body: 'upper', moves: [
    { id: 'wr_uln',  name: '手首尺屈', g: 'A', lr: true, desc: '「前にならえ」の姿勢で、手首を小指側にゆっくり曲げる' },
    { id: 'wr_rad',  name: '手首撓屈', g: 'B', lr: true, desc: '「前にならえ」の姿勢で、手首を親指側にゆっくり曲げる' },
    { id: 'wr_palm', name: '手首掌屈', g: 'C', lr: true, desc: '「前にならえ」の姿勢で、手首を手のひら側にゆっくり曲げる' },
    { id: 'wr_dors', name: '手首背屈', g: 'C', lr: true, desc: '「前にならえ」の姿勢で、手首を手の背側にゆっくり曲げる' },
  ]},
  { id: 'lowback', name: '腰', body: 'lower', moves: [
    { id: 'low_ext',  name: '腰後屈', g: 'D', lr: false, desc: '立ってゆっくりと腰を後方に曲げる' },
    { id: 'low_flex', name: '腰前屈', g: 'E', lr: false, desc: '立ってゆっくりと腰を前方に曲げる' },
    { id: 'low_lat',  name: '腰側屈', g: 'F', lr: true,  desc: '立ってゆっくりと腰を横にたおす' },
  ]},
  { id: 'hip', name: '股', body: 'lower', moves: [
    { id: 'hip_ext',  name: '股伸展', g: 'D', lr: true, desc: 'うつ伏せで腰を伸ばしてゆっくりと下肢を上げる' },
    { id: 'hip_flex', name: '股屈曲', g: 'E', lr: true, desc: '仰向けで腰を伸ばしてゆっくりと下肢を上げる' },
    { id: 'hip_er',   name: '股外旋', g: 'F', lr: true, desc: '仰向けで腰を曲げてゆっくりと股をひらく' },
    { id: 'hip_add',  name: '股内転', g: 'F', lr: true, desc: '仰向けで腰を伸ばしてゆっくりと股をとじる' },
    { id: 'hip_abd',  name: '股外転', g: 'F', lr: true, desc: '仰向けで腰を伸ばしてゆっくりと股をひらく' },
  ]},
  { id: 'knee', name: '膝', body: 'lower', moves: [
    { id: 'hip_flexk', name: '股屈曲（膝屈曲時）', g: 'E', lr: true, desc: '仰向けで膝をゆっくりと曲げる' },
    { id: 'knee_flex', name: '膝屈曲',             g: 'D', lr: true, desc: 'うつ伏せで膝をゆっくりと曲げる' },
  ]},
  { id: 'ankle', name: '足首', body: 'lower', moves: [
    { id: 'ank_pf',  name: '足首底屈', g: 'D', lr: true, desc: '仰向けで足首（先）をゆっくりと床に近づける' },
    { id: 'ank_df',  name: '足首背屈', g: 'E', lr: true, desc: '仰向けで足首（先）をゆっくりと膝に近づける' },
    { id: 'ank_inv', name: '足首内反', g: 'F', lr: true, desc: '仰向けで足首（先）をゆっくりと内側に曲げる（手で支えて曲げても可）' },
    { id: 'ank_ev',  name: '足首外反', g: 'F', lr: true, desc: '仰向けで足首（先）をゆっくりと外側に曲げる（手で支えて曲げても可）' },
  ]},
];

// データ一覧・スプレッドシートでの並び順（D〜F は腰の動作を先頭にする）
const GROUP_ORDER = {
  A: ['neck_ext', 'sho_ext', 'elb_pro', 'wr_uln'],
  B: ['neck_flex', 'sho_flex', 'elb_sup', 'wr_rad'],
  C: ['neck_lat', 'sho_hflex', 'sho_hext', 'elb_flex', 'elb_ext', 'wr_palm', 'wr_dors'],
  D: ['low_ext', 'hip_ext', 'knee_flex', 'ank_pf'],
  E: ['low_flex', 'hip_flex', 'hip_flexk', 'ank_df'],
  F: ['low_lat', 'hip_er', 'hip_add', 'hip_abd', 'ank_inv', 'ank_ev'],
};

// ケアする経穴
const CARE = {
  A: [
    { meridian: '手の太陰肺経',   img: 'care_A1', points: ['①太淵', '②尺沢'] },
    { meridian: '手の陽明大腸経', img: 'care_A2', points: ['③曲池', '④二間'] },
  ],
  B: [
    { meridian: '手の少陰心経',   img: 'care_B1', points: ['⑨少衝', '⑩神門'] },
    { meridian: '手の太陽小腸経', img: 'care_B2', points: ['⑪後渓', '⑫小海'] },
  ],
  C: [
    { meridian: '手の厥陰心包経', img: 'care_C1', points: ['⑰中衝', '⑱大陵'] },
    { meridian: '手の少陽三焦経', img: 'care_C2', points: ['⑲中渚', '⑳天井'] },
  ],
  D: [
    { meridian: '足の太陰脾経',   img: 'care_D1', points: ['⑤大都', '⑥商丘'] },
    { meridian: '足の陽明胃経',   img: 'care_D2', points: ['⑦解渓', '⑧厲兌'] },
  ],
  E: [
    { meridian: '足の少陰腎経',   img: 'care_E1', points: ['⑬復溜', '⑭湧泉'] },
    { meridian: '足の太陽膀胱経', img: 'care_E2', points: ['⑮至陰', '⑯束骨'] },
  ],
  F: [
    { meridian: '足の厥陰肝経',   img: 'care_F1', points: ['㉑曲泉', '㉒行間'] },
    { meridian: '足の少陽胆経',   img: 'care_F2', points: ['㉓侠渓', '㉔陽輔'] },
  ],
};

// スポーツ種目とポジションの選択肢（空配列はポジションを自由入力）
// 一覧にない種目・ポジションは「その他」を選んで自由入力できる
const SPORTS = {
  'サッカー': ['GK', 'DF', 'MF', 'FW'],
  'フットサル': ['ゴレイロ', 'フィクソ', 'アラ', 'ピヴォ'],
  '野球': ['投手', '捕手', '一塁手', '二塁手', '三塁手', '遊撃手', '外野手'],
  'ソフトボール': ['投手', '捕手', '一塁手', '二塁手', '三塁手', '遊撃手', '外野手'],
  'バスケットボール': ['PG', 'SG', 'SF', 'PF', 'C'],
  'バレーボール': ['アウトサイドヒッター', 'ミドルブロッカー', 'オポジット', 'セッター', 'リベロ'],
  'ハンドボール': ['GK', 'LW', 'LB', 'CB', 'RB', 'RW', 'PV'],
  'ラグビー': ['PR', 'HO', 'LO', 'FL', 'No.8', 'SH', 'SO', 'CTB', 'WTB', 'FB'],
  'アメリカンフットボール': ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K/P'],
  'テニス': ['シングルス', 'ダブルス'],
  'ソフトテニス': ['前衛', '後衛'],
  'バドミントン': ['シングルス', 'ダブルス'],
  '卓球': ['シングルス', 'ダブルス'],
  '陸上競技': ['短距離', '中距離', '長距離', '跳躍', '投てき', '混成', '競歩'],
  '水泳': ['自由形', '背泳ぎ', '平泳ぎ', 'バタフライ', '個人メドレー'],
  '柔道': [],
  '剣道': [],
  '空手': [],
  '体操': [],
  'ゴルフ': [],
};

// --- 派生データ ---
const MOVES = {};      // moveId -> move（partId 付き）
PARTS.forEach(p => p.moves.forEach(m => { MOVES[m.id] = { ...m, part: p.id }; }));

// チェック項目（左右を展開）。key 例: 'sho_ext_L', 'neck_ext'
function itemsOfMove(m) {
  return m.lr
    ? [{ key: m.id + '_L', label: m.name + '・左', move: m }, { key: m.id + '_R', label: m.name + '・右', move: m }]
    : [{ key: m.id, label: m.name, move: m }];
}
const GROUP_ITEMS = {};  // group -> [item]
Object.entries(GROUP_ORDER).forEach(([g, ids]) => {
  GROUP_ITEMS[g] = ids.flatMap(id => itemsOfMove(MOVES[id]));
});
const ALL_ITEMS = Object.values(GROUP_ITEMS).flat();
