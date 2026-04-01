// ============================================================
// AI情報ダッシュボード 情報収集・AI処理・統合スクリプト v1.0
// ============================================================

var SPREADSHEET_ID = "1Z0LsMZd1vcsyYnTaHUlqEvNVdNtVioxASfJ3FFYMLEc";
var SHEET_DB       = "記事DB";
var SHEET_KW       = "キーワード管理";
var MODEL          = "claude-haiku-4-5-20251001";

// ============================================================
// RSS収集（毎朝9時自動実行）
// ============================================================
function fetchAndStoreArticles() {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dbSheet = ss.getSheetByName(SHEET_DB);
  var kwSheet = ss.getSheetByName(SHEET_KW);

  var existingUrls = getExistingUrls(dbSheet);
  var keywords     = getActiveKeywords(kwSheet);

  if (keywords.length === 0) {
    Logger.log("有効なキーワードがありません。");
    return;
  }

  var newRowCount = 0;

  keywords.forEach(function(kw) {
    Logger.log("取得中: " + kw.keyword);
    var articles = fetchGoogleNewsRss(kw.keyword);

    articles.forEach(function(article) {
      if (existingUrls.indexOf(article.url) !== -1) return;

      dbSheet.appendRow([
        kw.category,
        article.title,
        article.url,
        article.source,
        article.pubDate,
        getNow(),
        kw.keyword,
        "",
        "",
        "",
        "",
      ]);

      existingUrls.push(article.url);
      newRowCount++;
    });

    Utilities.sleep(1000);
  });

  Logger.log("Google News 新規追記件数: " + newRowCount + "件");

  // 海外ブログRSSフィードも取得
  fetchDirectRssFeeds();
}

function fetchGoogleNewsRss(keyword) {
  var articles = [];
  // 日本語ニュースと英語ニュースの両方を取得
  var urls = [
    "https://news.google.com/rss/search?q=" + encodeURIComponent(keyword) + "&hl=ja&gl=JP&ceid=JP:ja",
    "https://news.google.com/rss/search?q=" + encodeURIComponent(keyword) + "&hl=en&gl=US&ceid=US:en"
  ];

  urls.forEach(function(url) {
    try {
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) return;

      var doc     = XmlService.parse(response.getContentText("UTF-8"));
      var channel = doc.getRootElement().getChild("channel");
      if (!channel) return;

      channel.getChildren("item").forEach(function(item) {
        var sourceEl = item.getChild("source");
        articles.push({
          title:   item.getChildText("title")   || "",
          url:     item.getChildText("link")    || "",
          source:  sourceEl ? sourceEl.getText() : "",
          pubDate: formatPubDate(item.getChildText("pubDate") || ""),
        });
      });
    } catch(e) {
      Logger.log("エラー（" + keyword + "）: " + e.message);
    }
  });
  return articles;
}

// 海外ブログRSSフィードの直接取得
var RSS_FEEDS = [
  { url: "https://www.anthropic.com/feed.xml",       source: "Anthropic Blog",      category: "LLM・基盤モデル" },
  { url: "https://simonwillison.net/atom/everything/", source: "Simon Willison",      category: "AI活用事例" },
  { url: "https://huggingface.co/blog/feed.xml",     source: "Hugging Face Blog",   category: "LLM・基盤モデル" },
  { url: "https://openai.com/blog/rss.xml",          source: "OpenAI Blog",         category: "LLM・基盤モデル" },
];

function fetchDirectRssFeeds() {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dbSheet = ss.getSheetByName(SHEET_DB);
  var existingUrls = getExistingUrls(dbSheet);
  var newRowCount  = 0;

  RSS_FEEDS.forEach(function(feed) {
    try {
      var response = UrlFetchApp.fetch(feed.url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        Logger.log("取得失敗: " + feed.source + " (" + response.getResponseCode() + ")");
        return;
      }

      var doc  = XmlService.parse(response.getContentText("UTF-8"));
      var root = doc.getRootElement();
      var ns   = root.getNamespace();

      var items = [];
      // RSS 2.0形式
      var channel = root.getChild("channel");
      if (channel) {
        items = channel.getChildren("item");
        items.forEach(function(item) {
          var articleUrl = item.getChildText("link") || "";
          if (!articleUrl || existingUrls.indexOf(articleUrl) !== -1) return;
          dbSheet.appendRow([
            feed.category,
            item.getChildText("title") || "",
            articleUrl,
            feed.source,
            formatPubDate(item.getChildText("pubDate") || ""),
            getNow(),
            feed.source,
            "", "", "", ""
          ]);
          existingUrls.push(articleUrl);
          newRowCount++;
        });
      }
      // Atom形式
      var entries = root.getChildren("entry", ns);
      if (entries.length > 0) {
        entries.forEach(function(entry) {
          var linkEl = entry.getChildren("link", ns);
          var articleUrl = "";
          linkEl.forEach(function(l) {
            var rel = l.getAttributeValue("rel") || "alternate";
            if (rel === "alternate" || !articleUrl) articleUrl = l.getAttributeValue("href") || "";
          });
          if (!articleUrl || existingUrls.indexOf(articleUrl) !== -1) return;
          var pubDate = entry.getChildText("published", ns) || entry.getChildText("updated", ns) || "";
          dbSheet.appendRow([
            feed.category,
            entry.getChildText("title", ns) || "",
            articleUrl,
            feed.source,
            formatPubDate(pubDate),
            getNow(),
            feed.source,
            "", "", "", ""
          ]);
          existingUrls.push(articleUrl);
          newRowCount++;
        });
      }

      Logger.log(feed.source + ": 取得完了");
      Utilities.sleep(500);
    } catch(e) {
      Logger.log("RSSエラー（" + feed.source + "）: " + e.message);
    }
  });

  Logger.log("海外RSSフィード取得完了。新規: " + newRowCount + "件");
}

function getActiveKeywords(sheet) {
  var data = sheet.getDataRange().getValues();
  var keywords = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][2] === "有効") {
      keywords.push({ keyword: String(data[i][0]), category: String(data[i][1]) });
    }
  }
  return keywords;
}

function getExistingUrls(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 3, lastRow - 1, 1).getValues()
    .map(function(row) { return row[0]; }).filter(Boolean);
}

function getNow() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm");
}

function formatPubDate(str) {
  try { return Utilities.formatDate(new Date(str), "Asia/Tokyo", "yyyy/MM/dd"); }
  catch(e) { return str; }
}

// ============================================================
// Claude API バッチ処理（23時送信・6時取得）
// ============================================================
function sendBatchToClaude() {
  var apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) { Logger.log("APIキーが見つかりません。"); return; }

  var dbSheet        = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_DB);
  var unprocessedRows = getUnprocessedRows(dbSheet);

  if (unprocessedRows.length === 0) { Logger.log("未処理の記事はありません。"); return; }
  Logger.log("未処理記事数: " + unprocessedRows.length + "件");

  var requests = unprocessedRows.map(function(row) {
    return {
      custom_id: "row-" + row.rowIndex,
      params: {
        model: MODEL, max_tokens: 300,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: buildUserPrompt(row) }]
      }
    };
  });

  var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "message-batches-2024-09-24" },
    payload: JSON.stringify({ requests: requests }),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  if (!result.id) { Logger.log("バッチ送信失敗: " + response.getContentText()); return; }

  PropertiesService.getScriptProperties().setProperty("BATCH_ID", result.id);
  Logger.log("バッチ送信完了。バッチID: " + result.id);
}

// 分割実行：通常Messages APIで1件ずつ処理（6分制限対策で自動継続）
function processArticles() {
  var apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) { Logger.log("APIキーが見つかりません。"); return; }

  var dbSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_DB);
  var unprocessedRows = getUnprocessedRows(dbSheet);

  if (unprocessedRows.length === 0) { Logger.log("未処理の記事はありません。"); return; }
  Logger.log("未処理記事数: " + unprocessedRows.length + "件 — 処理開始");

  var systemPrompt = buildSystemPrompt();
  var successCount = 0;
  var errorCount   = 0;
  var startTime    = new Date().getTime();
  var TIME_LIMIT   = 5 * 60 * 1000; // 5分で安全に止める

  for (var i = 0; i < unprocessedRows.length; i++) {
    if (new Date().getTime() - startTime > TIME_LIMIT) {
      Logger.log("時間制限に到達。処理済み: " + successCount + "件, エラー: " + errorCount + "件, 残り: " + (unprocessedRows.length - i) + "件");
      ScriptApp.newTrigger("processArticles").timeBased().after(10 * 1000).create();
      Logger.log("10秒後に自動継続トリガーを設定しました。");
      return;
    }

    var row = unprocessedRows[i];
    try {
      var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        payload: JSON.stringify({
          model: MODEL, max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: "user", content: buildUserPrompt(row) }]
        }),
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        Logger.log("APIエラー(行" + row.rowIndex + "): " + response.getContentText().substring(0, 200));
        errorCount++;
        continue;
      }

      var result = JSON.parse(response.getContentText());
      var parsed = parseClaudeResponse(result.content[0].text);
      dbSheet.getRange(row.rowIndex, 8).setValue(parsed.summary);
      dbSheet.getRange(row.rowIndex, 9).setValue(parsed.score);
      dbSheet.getRange(row.rowIndex, 10).setValue(parsed.stars);
      dbSheet.getRange(row.rowIndex, 11).setValue("済");
      successCount++;
    } catch(e) {
      Logger.log("処理エラー(行" + row.rowIndex + "): " + e.message);
      errorCount++;
    }
  }

  // 自動継続トリガーがあれば削除
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "processArticles") ScriptApp.deleteTrigger(t);
  });
  Logger.log("全件処理完了。成功: " + successCount + "件, エラー: " + errorCount + "件");
}

function retrieveBatchResults() {
  var apiKey  = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  var batchId = PropertiesService.getScriptProperties().getProperty("BATCH_ID");
  if (!apiKey || !batchId) { Logger.log("APIキーまたはバッチIDが見つかりません。"); return; }

  var statusRes = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages/batches/" + batchId, {
    method: "GET",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "message-batches-2024-09-24" },
    muteHttpExceptions: true
  });

  var status = JSON.parse(statusRes.getContentText());
  if (status.processing_status !== "ended") { Logger.log("まだ処理中: " + status.processing_status); return; }

  var resultsRes = UrlFetchApp.fetch(status.results_url, {
    method: "GET",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "message-batches-2024-09-24" },
    muteHttpExceptions: true
  });

  var dbSheet      = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_DB);
  var successCount = 0;

  resultsRes.getContentText().split("\n").filter(Boolean).forEach(function(line) {
    try {
      var item = JSON.parse(line);
      if (item.result.type !== "succeeded") return;
      var rowIndex = parseInt(item.custom_id.replace("row-", ""));
      var parsed   = parseClaudeResponse(item.result.message.content[0].text);
      dbSheet.getRange(rowIndex, 8).setValue(parsed.summary);
      dbSheet.getRange(rowIndex, 9).setValue(parsed.score);
      dbSheet.getRange(rowIndex, 10).setValue(parsed.stars);
      dbSheet.getRange(rowIndex, 11).setValue("済");
      successCount++;
    } catch(e) { Logger.log("行処理エラー: " + e.message); }
  });

  PropertiesService.getScriptProperties().deleteProperty("BATCH_ID");
  Logger.log("結果書き戻し完了。成功件数: " + successCount + "件");
}

function buildSystemPrompt() {
  return [
    "あなたはAI技術・エージェント工学の専門アシスタントです。",
    "株式会社タカインフォテクノは約200名のICT・SES企業で、Claude CodeやAIエージェントを活用した業務効率化を推進しています。",
    "",
    "【絶対ルール】回答はJSON1行のみ。前後に説明・挨拶・改行を一切付けないこと。",
    "記事タイトルと出典だけで内容が推測できない場合でも、推測して必ずJSONを返すこと。",
    "記事が英語の場合でも、summaryは必ず日本語で記述すること。",
    "",
    "【出力形式（この形式以外は不可）】",
    '{"summary":"①要点1。②要点2。③要点3。","score":75,"stars":"★★★"}',
    "",
    "summary: 記事の要点を①②③の3文で日本語で要約。各文は30字以内。",
    "score: 自社（ICT・SES・AI活用・業務効率化・エージェント工学）への実用度を0〜100の整数で評価。",
    "stars: 重要度を★（参考）★★（中程度）★★★（高い）の3段階で評価。"
  ].join("\n");
}

function buildUserPrompt(row) {
  return "【記事タイトル】" + row.title + "\n【出典】" + row.source + "\n【カテゴリー】" + row.category + "\n【公開日】" + row.pubDate;
}

function getUnprocessedRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var rows = [];
  data.forEach(function(row, index) {
    if (row[10] === "" || row[10] === null) {
      rows.push({ rowIndex: index + 2, category: row[0], title: row[1], source: row[3], pubDate: row[4] });
    }
  });
  return rows;
}

function parseClaudeResponse(text) {
  try {
    var clean = text.replace(/```json|```/g, "").trim();
    // まずそのままパースを試みる
    try {
      var parsed = JSON.parse(clean);
      return { summary: parsed.summary || "", score: parsed.score || 0, stars: parsed.stars || "★" };
    } catch(e1) {}
    // JSON部分を抽出して再試行
    var match = clean.match(/\{[\s\S]*"summary"[\s\S]*"score"[\s\S]*"stars"[\s\S]*\}/);
    if (match) {
      var parsed = JSON.parse(match[0]);
      return { summary: parsed.summary || "", score: parsed.score || 0, stars: parsed.stars || "★" };
    }
    return { summary: "解析エラー", score: 0, stars: "★" };
  } catch(e) {
    return { summary: "解析エラー", score: 0, stars: "★" };
  }
}

// ============================================================
// 月次レポート生成
// ============================================================
function getMonthlyReportData() {
  var ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reportSheet = ss.getSheetByName("月次レポート");
  if (!reportSheet || reportSheet.getLastRow() < 2) return { exists: false, reports: [] };

  var data    = reportSheet.getRange(2, 1, reportSheet.getLastRow() - 1, 3).getValues();
  var reports = [];

  data.forEach(function(row, index) {
    try {
      var createdAt = "";
      var targetMonth = "";
      try { createdAt = row[0] instanceof Date ? Utilities.formatDate(row[0], "Asia/Tokyo", "yyyy/MM/dd HH:mm") : String(row[0]); }
      catch(e2) { createdAt = String(row[0]); }
      try { targetMonth = row[1] instanceof Date ? Utilities.formatDate(row[1], "Asia/Tokyo", "yyyy年M月") : String(row[1]); }
      catch(e2) { targetMonth = String(row[1]); }
      reports.push({
        index:       index,
        createdAt:   createdAt,
        targetMonth: targetMonth,
        report:      JSON.parse(row[2])
      });
    } catch(e) {}
  });

  if (reports.length === 0) return { exists: false, reports: [] };
  return { exists: true, reports: reports };
}

function generateMonthlyReport() {
  var apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) { Logger.log("APIキーが見つかりません。"); return; }

  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dbSheet = ss.getSheetByName(SHEET_DB);
  var lastRow = dbSheet.getLastRow();
  if (lastRow < 2) { Logger.log("記事データがありません。"); return; }

  var now       = new Date();
  var lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var targetMonthStr = Utilities.formatDate(lastMonth, "Asia/Tokyo", "yyyy年M月");

  var data     = dbSheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var articles = [];

  data.forEach(function(row) {
    if (!row[1] || row[10] !== "済") return;
    var fetchedAt = new Date(row[5]);
    if (isNaN(fetchedAt)) return;
    if (fetchedAt.getFullYear() === lastMonth.getFullYear() && fetchedAt.getMonth() === lastMonth.getMonth()) {
      articles.push({ category: String(row[0]||""), title: String(row[1]||""), url: String(row[2]||""), source: String(row[3]||""), pubDate: String(row[4]||""), summary: String(row[7]||""), score: Number(row[8])||0, stars: String(row[9]||"") });
    }
  });

  if (articles.length === 0) {
    Logger.log("先月分がないため今月分で生成します。");
    targetMonthStr = Utilities.formatDate(now, "Asia/Tokyo", "yyyy年M月");
    data.forEach(function(row) {
      if (!row[1] || row[10] !== "済") return;
      var fetchedAt = new Date(row[5]);
      if (isNaN(fetchedAt)) return;
      if (fetchedAt.getFullYear() === now.getFullYear() && fetchedAt.getMonth() === now.getMonth()) {
        articles.push({ category: String(row[0]||""), title: String(row[1]||""), url: String(row[2]||""), source: String(row[3]||""), pubDate: String(row[4]||""), summary: String(row[7]||""), score: Number(row[8])||0, stars: String(row[9]||"") });
      }
    });
  }

  if (articles.length === 0) { Logger.log("レポート生成に使える記事がありません。"); return; }
  Logger.log("レポート対象: " + articles.length + "件（" + targetMonthStr + "）");

  var catCount = {};
  articles.forEach(function(a) { catCount[a.category] = (catCount[a.category] || 0) + 1; });

  var highArticles = articles.filter(function(a) { return a.stars === "★★★"; })
    .sort(function(a, b) { return b.score - a.score; }).slice(0, 10);

  var catSummary = Object.keys(catCount).map(function(k) { return k + ": " + catCount[k] + "件"; }).join("、");
  var highList   = highArticles.map(function(a, i) {
    return (i+1) + ". 【" + a.category + "】" + a.title + "\n   " + a.summary;
  }).join("\n");

  var prompt = [
    "以下は" + targetMonthStr + "に収集したAI技術・エージェント工学関連記事の分析データです。",
    "【カテゴリー別件数】" + catSummary + "（合計 " + articles.length + "件）",
    "【高重要度記事トップ10】",
    highList,
    "",
    "以下のJSON形式で月次レポートを生成してください。JSON以外は一切出力しないこと。",
    '{"targetMonth":"' + targetMonthStr + '","totalCount":記事総数,"categoryBreakdown":[{"name":"カテゴリー名","count":件数}],"trendSummary":"今月の傾向3〜4文","keyTopics":["トピック1","トピック2","トピック3"],"recommendations":[{"title":"提言タイトル","detail":"具体的アクション2〜3文","priority":"高/中/低"}],"pickupArticles":[{"title":"記事タイトル","category":"カテゴリー","summary":"サマリー","score":スコア}]}',
    "【条件】",
    "- categoryBreakdown には記事DBに存在する全カテゴリーを必ず含めること（件数が少なくても省略しない）",
    "- recommendations はAI活用・業務効率化に向けた具体的な提言を3〜5件",
    "- pickupArticles は高重要度記事から特に重要な3〜5件",
    "- 株式会社タカインフォテクノ（約200名・ICT/SES企業）がAIを業務に活用する視点で記述すること"
  ].join("\n");

  var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  if (!result.content || !result.content[0]) { Logger.log("API失敗: " + response.getContentText()); return; }

  var clean = result.content[0].text.replace(/```json|```/g, "").trim();
  var reportJson;
  try { reportJson = JSON.parse(clean); } catch(e) { Logger.log("JSONパースエラー: " + result.content[0].text); return; }

  // pickupArticlesにURLを補完（タイトルで突き合わせ）
  if (reportJson.pickupArticles) {
    reportJson.pickupArticles.forEach(function(pickup) {
      var matched = articles.filter(function(a) { return a.title === pickup.title; })[0];
      if (matched) { pickup.url = matched.url; }
      else {
        // 部分一致でも試みる
        matched = articles.filter(function(a) { return a.title.indexOf(pickup.title) !== -1 || pickup.title.indexOf(a.title) !== -1; })[0];
        if (matched) { pickup.url = matched.url; }
      }
    });
  }
  clean = JSON.stringify(reportJson);

  var reportSheet = ss.getSheetByName("月次レポート");
  reportSheet.appendRow([getNow(), targetMonthStr, clean]);
  Logger.log("月次レポート生成完了: " + targetMonthStr);
}

// ============================================================
// ダッシュボード用データ取得
// ============================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile("dashboard")
    .setTitle("AI情報ダッシュボード")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getArticlesData() {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dbSheet = ss.getSheetByName(SHEET_DB);
  var lastRow = dbSheet.getLastRow();
  if (lastRow < 2) return [];

  var data     = dbSheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var articles = [];

  data.forEach(function(row, index) {
    if (!row[1]) return;
    var pubDate = "", fetchedAt = "";
    try { pubDate   = row[4] ? Utilities.formatDate(new Date(row[4]), "Asia/Tokyo", "yyyy/MM/dd") : ""; } catch(e) { pubDate = String(row[4]||""); }
    try { fetchedAt = row[5] ? Utilities.formatDate(new Date(row[5]), "Asia/Tokyo", "yyyy/MM/dd HH:mm") : ""; } catch(e) { fetchedAt = String(row[5]||""); }

    articles.push({
      rowIndex:  index + 2,
      category:  String(row[0]  || ""),
      title:     String(row[1]  || ""),
      url:       String(row[2]  || ""),
      source:    String(row[3]  || ""),
      pubDate:   pubDate,
      fetchedAt: fetchedAt,
      keyword:   String(row[6]  || ""),
      summary:   String(row[7]  || ""),
      score:     Number(row[8]) || 0,
      stars:     String(row[9]  || ""),
      processed: String(row[10] || ""),
    });
  });

  articles.sort(function(a, b) { return (b.fetchedAt > a.fetchedAt) ? 1 : -1; });
  return articles;
}

function getKeywordsData() {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var kwSheet = ss.getSheetByName("キーワード管理");
  if (!kwSheet) return [];
  var lastRow = kwSheet.getLastRow();
  if (lastRow < 2) return [];

  return kwSheet.getRange(2, 1, lastRow - 1, 5).getValues()
    .filter(function(row) { return row[0]; })
    .map(function(row) {
      return { keyword: String(row[0]), category: String(row[1]), status: String(row[2]), addedAt: String(row[3]), note: String(row[4]) };
    });
}

function addKeyword(keyword, category) {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var kwSheet = ss.getSheetByName("キーワード管理");
  kwSheet.appendRow([keyword, category, "有効", getNow().slice(0, 10), ""]);
  return { success: true };
}

function toggleKeyword(rowIndex, newStatus) {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var kwSheet = ss.getSheetByName("キーワード管理");
  kwSheet.getRange(rowIndex, 3).setValue(newStatus);
  return { success: true };
}

function getArticleCount() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_DB).getLastRow();
}

// ============================================================
// トリガー設定（初回のみ実行）
// ============================================================
function setAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger("fetchAndStoreArticles").timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger("processArticles").timeBased().everyDays(1).atHour(23).create();
  ScriptApp.newTrigger("generateMonthlyReport").timeBased().onMonthDay(1).atHour(7).create();

  Logger.log("全トリガー設定完了。");
}
