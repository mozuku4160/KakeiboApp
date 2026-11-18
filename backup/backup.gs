/**
 * ふたりの家計簿:Google ドライブへの毎日のバックアップ(Google Apps Script)
 *
 * 使い方
 *  1. script.google.com で新しいプロジェクトを作り、このファイルの中身を貼り付ける
 *  2. 「プロジェクトの設定」→「スクリプト プロパティ」に次の 4 つを追加する
 *       SUPABASE_URL     … https://xxxx.supabase.co
 *       SUPABASE_KEY     … 公開用キー(sb_publishable_...)
 *       BACKUP_EMAIL     … バックアップ専用ユーザーのメールアドレス
 *       BACKUP_PASSWORD  … バックアップ専用ユーザーのパスワード
 *  3. 関数「backup」を一度実行して、権限を許可し、ドライブに保存されるか確認する
 *  4. 関数「setupTrigger」を一度実行すると、毎日 3 時台に自動で実行される
 *
 * 保存先:マイドライブの「家計簿バックアップ」フォルダに、日付ごとのフォルダを作って保存
 * 保存期間:KEEP_DAYS 日より古い日付フォルダはゴミ箱へ
 * このスクリプトはデータを読むだけで、書き換えません(バックアップ用ユーザーは読み取り専用)
 */

const FOLDER_NAME = '家計簿バックアップ';
const KEEP_DAYS = 31;
const TABLES = [
  { name: 'entries',    order: 'id.asc' },
  { name: 'recurring',  order: 'id.asc' },
  { name: 'categories', order: 'id.asc' },
  { name: 'settings',   order: 'key.asc' },
];
const PAGE = 1000;

function backup() {
  const p = PropertiesService.getScriptProperties().getProperties();
  ['SUPABASE_URL', 'SUPABASE_KEY', 'BACKUP_EMAIL', 'BACKUP_PASSWORD'].forEach(k => {
    if (!p[k]) throw new Error('スクリプト プロパティ ' + k + ' が設定されていません');
  });
  const base = p.SUPABASE_URL.replace(/\/+$/, '');
  const token = login_(base, p.SUPABASE_KEY, p.BACKUP_EMAIL, p.BACKUP_PASSWORD);

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const root = getRootFolder_();
  const old = root.getFoldersByName(today);
  while (old.hasNext()) old.next().setTrashed(true);   // 同じ日に再実行したら作り直す
  const day = root.createFolder(today);

  const summary = [];
  TABLES.forEach(t => {
    const rows = fetchAll_(base, p.SUPABASE_KEY, token, t);
    if (rows === null) { summary.push(t.name + ': (表なし)'); return; }
    day.createFile(t.name + '.csv', toCsv_(rows), MimeType.CSV);
    summary.push(t.name + ': ' + rows.length + '件');
  });
  if (!summary.some(s => s.indexOf('entries: ') === 0 && s.indexOf('(表なし)') < 0)) {
    throw new Error('entries を取得できませんでした');
  }

  cleanup_(root);
  console.log(today + ' ' + summary.join(' / '));
}

function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(tr => tr.getHandlerFunction() === 'backup')
    .forEach(tr => ScriptApp.deleteTrigger(tr));
  ScriptApp.newTrigger('backup').timeBased().everyDays(1).atHour(3).inTimezone('Asia/Tokyo').create();
  console.log('毎日 3 時台に backup を実行するよう設定しました');
}

function login_(base, key, email, password) {
  const res = UrlFetchApp.fetch(base + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: key },
    payload: JSON.stringify({ email: email, password: password }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('ログインに失敗しました(' + res.getResponseCode() + ')。メールアドレスとパスワードを確認してください');
  }
  return JSON.parse(res.getContentText()).access_token;
}

/** 表の全行を取得する。表がないときは null */
function fetchAll_(base, key, token, t) {
  let all = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = base + '/rest/v1/' + t.name + '?select=*&order=' + t.order + '&limit=' + PAGE + '&offset=' + offset;
    const res = UrlFetchApp.fetch(url, {
      headers: { apikey: key, Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 404) return null;
    if (code !== 200) throw new Error(t.name + ' の取得に失敗しました(' + code + '): ' + res.getContentText().slice(0, 200));
    const rows = JSON.parse(res.getContentText());
    all = all.concat(rows);
    if (rows.length < PAGE) return all;
  }
}

/** 列名つきの CSV(Supabase の「Import data from CSV」でそのまま戻せる形) */
function toCsv_(rows) {
  if (!rows.length) return '';
  const cols = [];
  rows.forEach(r => Object.keys(r).forEach(k => { if (cols.indexOf(k) < 0) cols.push(k); }));
  const q = v => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(',')].concat(rows.map(r => cols.map(c => q(r[c])).join(','))).join('\r\n') + '\r\n';
}

function getRootFolder_() {
  const it = DriveApp.getRootFolder().getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(FOLDER_NAME);
}

function cleanup_(root) {
  const limit = Utilities.formatDate(new Date(Date.now() - KEEP_DAYS * 86400000), 'Asia/Tokyo', 'yyyy-MM-dd');
  const it = root.getFolders();
  while (it.hasNext()) {
    const f = it.next(), n = f.getName();
    if (/^\d{4}-\d{2}-\d{2}$/.test(n) && n < limit) f.setTrashed(true);
  }
}
