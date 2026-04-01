# AI情報ダッシュボード システム仕様書 v1.0

作成日：2026年3月24日
最終更新：2026年3月24日（processArticles対応）
管理者：林部
Googleアカウント：sakamoto.chie@gmail.com

---

## 1. プロジェクト概要

Claude Code・エージェント工学を中心としたAI技術の情報収集を自動化・可視化するWebダッシュボード。Googleニュース（日本語＋英語）と海外ブログRSSから記事を自動収集し、Claude AIが分類・要約（日本語）・重要度スコアを付与。ブラウザで閲覧できるダッシュボードに表示する。

### 背景

ワクハピダッシュボード（女性活躍推進）の仕組みを応用し、AI情報収集に特化したダッシュボードとして新規構築。海外の一次情報を日本語要約で効率的にキャッチアップすることが目的。

### システムの特徴

- **ワクハピダッシュボードと同じアーキテクチャ**：GAS + スプレッドシート + Claude API
- **日英両方の情報を収集**：Google News日本語・英語 + 海外ブログRSS直接取得
- **英語記事も日本語で要約**：Claudeが自動で日本語サマリーを生成
- **自社（タカインフォテクノ）の業務改善視点でスコアリング**
- **別Googleアカウント・別APIキーで独立運用**：ワクハピとは課金・管理を分離

---

## 2. システム構成

### 全体アーキテクチャ

```
【収集層】
Google News RSS（日本語＋英語）
海外ブログ RSS（Anthropic, Simon Willison, Hugging Face, OpenAI）
    ↓ GAS（毎朝9時・自動実行）
Googleスプレッドシート（記事DB）

【AI処理層】
GAS（毎晩23時）→ Claude API 通常Messages APIで分割実行（5分ごと自動継続）

【活用層】
GAS Web App（doGet）→ ブラウザでダッシュボード表示
月次レポート（毎月1日7時・自動生成）
```

### 使用技術

| 役割 | 技術 |
|------|------|
| スクリプト実行環境 | Google Apps Script（GAS） |
| データストレージ | Googleスプレッドシート |
| AI処理 | Anthropic Claude API（claude-haiku-4-5-20251001） |
| フロントエンド | GAS HtmlService（HTML/CSS/JS） |
| RSS取得 | Googleニュース RSS（日英） + 海外ブログ RSS |
| ローカル開発 | clasp（GASプロジェクトとの同期） |

### ワクハピダッシュボードとの違い

| 項目 | ワクハピ | AI情報 |
|------|---------|--------|
| テーマ | 女性活躍推進・DEI | Claude Code・エージェント工学 |
| Googleアカウント | takawakuhapi@gmail.com | sakamoto.chie@gmail.com |
| APIキー | 共通Anthropicアカウント | 別キー（課金可視化のため） |
| 情報ソース | Google News（日本語のみ） | Google News（日英）+ 海外ブログRSS |
| 英語記事 | なし | あり（要約は日本語化） |
| カラーテーマ | ローズ系（#d4607a） | ブルー系（#3b82f6） |

---

## 3. スプレッドシート構成

**スプレッドシートID**：`1Z0LsMZd1vcsyYnTaHUlqEvNVdNtVioxASfJ3FFYMLEc`

### シート①：記事DB

| 列 | 項目名 | 内容 |
|----|--------|------|
| A | カテゴリー | LLM・基盤モデル / エージェント工学 / プロンプトエンジニアリング / AI活用事例 / 開発ツール・IDE / その他 |
| B | 記事タイトル | RSSから取得したタイトル（英語記事は英語のまま） |
| C | URL | 記事のURL |
| D | 出典 | 媒体名（Anthropic Blog, Simon Willison 等） |
| E | 公開日 | 記事の公開日（yyyy/MM/dd） |
| F | 取得日時 | GASが取得した日時（yyyy/MM/dd HH:mm） |
| G | 検索キーワード | どのキーワードまたはRSSソースで取得したか |
| H | AIサマリー | Claude APIが生成した3行要約（①②③形式・日本語） |
| I | 自社関連度スコア | 0〜100の整数（Claude APIが判定） |
| J | 重要度 | ★ / ★★ / ★★★（Claude APIが判定） |
| K | 処理済みフラグ | 空白＝未処理 / 済＝Claude API処理完了 |

### シート②：キーワード管理

| 列 | 項目名 | 内容 |
|----|--------|------|
| A | キーワード | 検索キーワード |
| B | カテゴリー | 記事DBに書き込むカテゴリー名 |
| C | 有効/無効 | 「有効」のみRSS取得対象 |
| D | 追加日 | キーワードを追加した日付 |
| E | 備考 | メモ |

**初期キーワード：**
Claude Code / AI Agent / LLM / Prompt Engineering / Claude Anthropic

### シート③：月次レポート

| 列 | 項目名 | 内容 |
|----|--------|------|
| A | 生成日時 | レポートを生成した日時 |
| B | 対象月 | 例：2026年3月 |
| C | レポートJSON | Claude APIが出力したJSONデータ |

---

## 4. GASスクリプト仕様

**ファイル名**：`コード.js`（単一ファイルに全関数をまとめている）

### グローバル変数

```javascript
var SPREADSHEET_ID = "1Z0LsMZd1vcsyYnTaHUlqEvNVdNtVioxASfJ3FFYMLEc";
var SHEET_DB       = "記事DB";
var SHEET_KW       = "キーワード管理";
var MODEL          = "claude-haiku-4-5-20251001";
```

### APIキーの管理

- プロパティ名：`ANTHROPIC_API_KEY`
- 取得方法：`PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY")`
- ワクハピとは別キーを使用（プロジェクト別課金の可視化のため）

### 海外ブログRSSフィード定義

```javascript
var RSS_FEEDS = [
  { url: "https://www.anthropic.com/feed.xml",         source: "Anthropic Blog",    category: "LLM・基盤モデル" },
  { url: "https://simonwillison.net/atom/everything/", source: "Simon Willison",    category: "AI活用事例" },
  { url: "https://huggingface.co/blog/feed.xml",       source: "Hugging Face Blog", category: "LLM・基盤モデル" },
  { url: "https://openai.com/blog/rss.xml",            source: "OpenAI Blog",       category: "LLM・基盤モデル" },
];
```

これらはキーワード管理シートに関係なく、毎朝の収集時に自動取得される。RSS 2.0形式とAtom形式の両方に対応。

### 関数一覧

#### RSS収集系

| 関数名 | 役割 |
|--------|------|
| `fetchAndStoreArticles()` | メイン関数。キーワードでGoogle News（日英）を検索し、さらに海外ブログRSSも取得して記事DBに追記する |
| `fetchGoogleNewsRss(keyword)` | Google News RSSを日本語・英語の両方で取得してパースする |
| `fetchDirectRssFeeds()` | RSS_FEEDSに定義された海外ブログRSSを直接取得する。RSS 2.0/Atom両対応 |
| `getActiveKeywords(sheet)` | キーワード管理シートから「有効」なキーワード一覧を返す |
| `getExistingUrls(sheet)` | 記事DBの既存URL一覧を返す（重複チェック用） |
| `formatPubDate(str)` | RSS日付文字列を`yyyy/MM/dd`形式に変換する |
| `getNow()` | 現在日時を`yyyy/MM/dd HH:mm`形式で返す |

**Google News RSSのURL形式：**
```
日本語: https://news.google.com/rss/search?q={キーワード}&hl=ja&gl=JP&ceid=JP:ja
英語:   https://news.google.com/rss/search?q={キーワード}&hl=en&gl=US&ceid=US:en
```

#### Claude API 処理系

| 関数名 | 役割 |
|--------|------|
| `processArticles()` | K列が空白の未処理記事を通常Messages APIで1件ずつ処理する（毎晩23時） |
| `sendBatchToClaude()` | ※旧方式（Batch API送信）。現在は未使用 |
| `retrieveBatchResults()` | ※旧方式（Batch API結果取得）。現在は未使用 |
| `buildSystemPrompt()` | Claude APIへのシステムプロンプトを生成する |
| `buildUserPrompt(row)` | 記事ごとのユーザープロンプトを生成する |
| `getUnprocessedRows(sheet)` | K列が空白の未処理行一覧を返す |
| `parseClaudeResponse(text)` | ClaudeのJSON回答をパースしてsummary・score・starsを返す |

**processArticlesの仕組み：**
- 通常のMessages API（非バッチ）で1件ずつ処理
- GASの6分実行制限対策として、5分経過で安全に停止し、10秒後に自動継続トリガーを作成
- 全件処理完了後、自動継続トリガーを自動削除
- Batch API障害時でも安定して動作する（2026-03-24にBatch API障害を受けて切り替え）

**Claudeへのシステムプロンプトのポイント：**
- 「AI技術・エージェント工学の専門アシスタント」として設定
- 「記事が英語の場合でも、summaryは必ず日本語で記述すること」を指示
- スコアリング基準：「ICT・SES・AI活用・業務効率化・エージェント工学」への実用度

**ClaudeのJSON出力形式：**
```json
{
  "summary": "①〜の内容。②〜の内容。③〜の内容。",
  "score": 75,
  "stars": "★★★"
}
```

#### 月次レポート系

| 関数名 | 役割 |
|--------|------|
| `generateMonthlyReport()` | 先月分の記事を集計してClaude APIでレポートを生成する |
| `getMonthlyReportData()` | 月次レポートシートの全レポートをJSON配列で返す |

**月次レポートのJSON構造：**
```json
{
  "targetMonth": "2026年3月",
  "totalCount": 120,
  "categoryBreakdown": [
    { "name": "LLM・基盤モデル", "count": 45 },
    { "name": "エージェント工学", "count": 30 }
  ],
  "trendSummary": "今月の傾向を3〜4文で記述",
  "keyTopics": ["トピック1", "トピック2", "トピック3"],
  "recommendations": [
    {
      "title": "提言タイトル",
      "detail": "具体的なアクション内容（2〜3文）",
      "priority": "高"
    }
  ],
  "pickupArticles": [
    {
      "title": "記事タイトル",
      "category": "エージェント工学",
      "summary": "サマリー",
      "score": 92,
      "url": "https://..."
    }
  ]
}
```

#### ダッシュボード用データ取得系

| 関数名 | 役割 |
|--------|------|
| `doGet()` | GAS WebアプリのエントリーポイントHTMLを返す |
| `getArticlesData()` | 記事DB全件をJSONで返す |
| `getKeywordsData()` | キーワード管理シートの全行をJSONで返す |
| `addKeyword(keyword, category)` | キーワード管理シートに新しいキーワードを追加する |
| `toggleKeyword(rowIndex, newStatus)` | キーワードの有効/無効を切り替える |
| `getArticleCount()` | 記事DBの行数を返す |

#### トリガー設定

| 関数名 | 役割 |
|--------|------|
| `setAllTriggers()` | 全トリガーを一括設定する（初回のみ手動実行） |

**トリガー設定内容：**

| 関数 | 実行タイミング |
|------|---------------|
| `fetchAndStoreArticles` | 毎日9時（RSS収集：Google News日英＋海外ブログ） |
| `processArticles` | 毎日23時（AI処理・分割実行） |
| `generateMonthlyReport` | 毎月1日7時（月次レポート生成） |

---

## 5. ダッシュボード仕様

**ファイル名**：`dashboard.html`

### カラーテーマ

ブルー系のテック配色。ワクハピ（ローズ系）とは差別化。

```css
--rose: #3b82f6 (ブルー・アクセントカラー)
--rose-light: #eff6ff
--gold: #f59e0b (アンバー)
--teal: #10b981 (エメラルド)
--lavender: #8b5cf6 (バイオレット)
--navy: #1a2744 (ダークネイビー・共通)
```

### カテゴリー別カラー定義

| カテゴリー | 背景色 | テキスト色 | ドット色 |
|------------|--------|------------|----------|
| LLM・基盤モデル | #eff6ff | #2563eb | #3b82f6 |
| エージェント工学 | #ecfdf5 | #059669 | #10b981 |
| プロンプトエンジニアリング | #f5f3ff | #7c3aed | #8b5cf6 |
| AI活用事例 | #fefce8 | #ca8a04 | #f59e0b |
| 開発ツール・IDE | #fef2f2 | #dc2626 | #ef4444 |
| その他 | #f0efe9 | #6b6960 | #a09e93 |

### 画面構成

タブ切替式の4画面構成（ワクハピと同じ）。

#### タブ①：📰 新着記事
- サイドバー：カテゴリー / 期間 / 重要度フィルター + 監視キーワード管理
- メインエリア：統計カード4枚 + 記事カード一覧（新着順）
- NEWバッジ（当日取得）、★★★記事にブルーの左ボーダー

#### タブ②：📊 月次レポート
- 月選択 + 「今すぐ生成」ボタン
- 傾向まとめ / カテゴリー別件数 / 注目トピック / 自社への提言 / 注目記事ピックアップ

#### タブ③：📖 使い方ガイド
- ダッシュボードの概要・画面の見方・キーワード管理・自動化の説明・FAQ

#### タブ④：🔧 管理者マニュアル
- 記事の再取得・再処理・レポート再生成・トリガー復旧・デプロイ手順・関数一覧

---

## 6. GAS Webアプリの公開設定

| 設定項目 | 値 |
|----------|----|
| 次のユーザーとして実行 | 自分（sakamoto.chie@gmail.com） |
| アクセスできるユーザー | 全員 |
| デプロイの種類 | ウェブアプリ |

---

## 7. Claude Code + clasp での開発環境

### 環境情報

| 項目 | 値 |
|------|-----|
| clasp インストール先 | `D:\Program Files\npm-global` |
| clasp 実行パス | `"/d/Program Files/npm-global/clasp"` |
| GAS スクリプトID | `1fhUxUL3Y8EHslGxVIr880qFUgxQ_G7rj8xYxoSoMqapHsGzah-U45E0E` |
| 作業ディレクトリ | `D:\AI情報ダッシュボード` |
| ログインアカウント | sakamoto.chie@gmail.com |

**注意：** claspは1アカウントしか同時ログインできないため、ワクハピダッシュボード（takawakuhapi@gmail.com）とは切り替えが必要。`~/.clasprc.json` を削除して `clasp login` で切り替える。

### ファイル構成

```
D:\AI情報ダッシュボード\
├── コード.js              ← GASスクリプト（全関数）※GAS上では コード.gs
├── dashboard.html          ← ダッシュボードHTML
├── appsscript.json         ← GASプロジェクト設定
├── .clasp.json             ← clasp接続設定
├── .claspignore            ← push除外設定
└── docs/
    └── ai_dashboard_spec_v1.0.md  ← この仕様書
```

---

## 8. アクセス先一覧

| 項目 | 情報 |
|------|------|
| Googleアカウント | sakamoto.chie@gmail.com |
| スプレッドシート | https://docs.google.com/spreadsheets/d/1Z0LsMZd1vcsyYnTaHUlqEvNVdNtVioxASfJ3FFYMLEc |
| GASエディタ | https://script.google.com/d/1fhUxUL3Y8EHslGxVIr880qFUgxQ_G7rj8xYxoSoMqapHsGzah-U45E0E/edit |
| ダッシュボードURL | GASエディタ→デプロイを管理→URLを確認 |
| Anthropic APIコンソール | https://console.anthropic.com |

---

## 9. 今後の拡張候補

- **RSSソースの追加**：The Verge AI、MIT Technology Review、Hacker News等
- **X（Twitter）連携**：Grok APIやX APIを使った投稿取得（現在はRSSのみ）
- **記事本文の取得**：タイトルだけでなく本文もフェッチしてより精度の高い要約を生成
- **テンプレート化**：共通部分を抽出し、テーマを変えるだけで新ダッシュボードを作れるようにする
- **Slackへの通知**：高重要度記事を自動通知
