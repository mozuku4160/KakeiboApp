# ふたりの家計簿

夫婦で使う家計簿アプリです。GitHub Pages で公開し、データは Supabase に保存します。

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | 画面の骨組み。接続先の制限(CSP)と、`app.js` / `style.css` の版番号(`?v=`)を持つ |
| `app.js` | アプリ本体 |
| `style.css` | 見た目 |
| `supabase.min.js` | Supabase 接続ライブラリ(v2.45.4 を同梱) |
| `sql/` | データベースの変更履歴。番号順に実行する |
| `.github/workflows/check.yml` | PR ごとの自動チェック |

## 更新の流れ

1. Claude が `claude/v番号-説明` のブランチを作り、修正して PR を出す
2. 自動チェック(check)が成功しているか確認する
3. PR の説明に「SQL の実行が必要」とある場合は、**Merge の前に** Supabase の SQL Editor で実行する
4. **Squash and merge** で取り込む
5. 数分で GitHub Pages に反映される。スマホではタブを閉じて開き直す

## ルール

- PR のタイトルは `v番号: 変更内容`
- `app.js` か `style.css` を変えたら、`index.html` の `?v=` を両方そろえて上げる
- PR は1つずつ出す(公開処理が詰まらないように)
- 秘密の鍵(secret key)、データベースのパスワード、CSV などの家計データはリポジトリに入れない
- 公開用キー(publishable key)は公開して問題ない。データはログインした人しか読めない(RLS)

## 元に戻すとき

ブラウザで該当の PR を開き、**Revert** を押すと、取り消しの PR が作られる。それを Merge する。
画面のファイルが戻るだけで、Supabase のデータは戻らない。
