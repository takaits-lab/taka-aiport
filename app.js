/* ===== AI情報ダッシュボード - app.js ===== */
/* GitHub Pages版：google.script.run → fetch() でGAS APIを呼び出す */

// GAS WebアプリのURL（設定画面で変更可能、localStorageに保存）
var GAS_API_URL = localStorage.getItem('ai-dashboard-gas-url') || '';

// GAS APIを呼び出す共通関数（GETリクエスト）
function gasGet(action) {
  if (!GAS_API_URL) return Promise.reject('GAS URLが未設定です');
  return fetch(GAS_API_URL + '?action=' + action)
    .then(function(r) { return r.json(); });
}

// GAS APIを呼び出す共通関数（POSTリクエスト）
function gasPost(data) {
  if (!GAS_API_URL) return Promise.reject('GAS URLが未設定です');
  return fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(data)
  }).then(function(r) { return r.json(); });
}

// ===== グローバル変数 =====
var allArticles   = [];
var keywords      = [];
var currentCat    = 'all';
var currentPeriod = 30;
var currentStars  = 'all-stars';

// カテゴリーの色定義
var CAT_COLORS = {
  'LLM・基盤モデル':            {bg:'#eff6ff',text:'#2563eb',dot:'#3b82f6'},
  'エージェント工学':            {bg:'#ecfdf5',text:'#059669',dot:'#10b981'},
  'AIコーディング支援':          {bg:'#fef2f2',text:'#dc2626',dot:'#ef4444'},
  'AI運用・自動化':             {bg:'#fff7ed',text:'#c2410c',dot:'#f97316'},
  'AI検索・リサーチ':           {bg:'#e0f2fe',text:'#0369a1',dot:'#0ea5e9'},
  'AI活用事例':                 {bg:'#fefce8',text:'#ca8a04',dot:'#f59e0b'},
  'AIガバナンス・セキュリティ':   {bg:'#fdf2f8',text:'#be185d',dot:'#ec4899'},
  'プロンプトエンジニアリング':    {bg:'#f5f3ff',text:'#7c3aed',dot:'#8b5cf6'},
  '開発ツール・IDE':            {bg:'#f1f5f9',text:'#475569',dot:'#64748b'},
  'その他':                     {bg:'#f0efe9',text:'#6b6960',dot:'#a09e93'},
};

function getCatColor(cat) {
  return CAT_COLORS[cat] || {bg:'#f0efe9',text:'#6b6960',dot:'#a09e93'};
}

// ===== タブ切り替え =====
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('tab-articles').style.display = tab === 'articles' ? '' : 'none';
  document.getElementById('tab-report').style.display = tab === 'report' ? '' : 'none';
  document.getElementById('tab-guide').style.display = tab === 'guide' ? '' : 'none';
  document.getElementById('tab-admin').style.display = tab === 'admin' ? '' : 'none';
  if (tab === 'report') loadReport();
}

// ===== データ読み込み =====
function loadData() {
  // GAS URLが未設定の場合はエラーを表示
  if (!GAS_API_URL) {
    document.getElementById('articles-container').innerHTML =
      '<div class="error-box">GAS WebアプリのURLが未設定です。「管理者マニュアル」タブからURLを設定してください。</div>';
    document.getElementById('kw-list').innerHTML =
      '<div style="font-size:11px;color:var(--gray-400)">GAS URL未設定</div>';
    return;
  }

  // 記事データの取得
  gasGet('getArticles')
    .then(function(data) {
      allArticles = data || [];
      updateStats();
      buildCategoryFilters();
      renderArticles();
      document.getElementById('last-updated').textContent = '最終更新 ' + fmtDate(new Date().toISOString());
    })
    .catch(function(err) {
      document.getElementById('articles-container').innerHTML =
        '<div class="error-box">記事データ取得失敗：' + (err.message || String(err)) + '</div>';
    });

  // キーワードデータの取得
  gasGet('getKeywords')
    .then(function(data) {
      keywords = data || [];
      renderKeywords();
      updateActiveKwLabel();
    })
    .catch(function() {
      document.getElementById('kw-list').innerHTML =
        '<div style="font-size:11px;color:#c0392b">取得失敗</div>';
    });
}

// キーワード再読み込み
function reloadKeywords() {
  gasGet('getKeywords')
    .then(function(data) {
      keywords = data || [];
      renderKeywords();
      updateActiveKwLabel();
    });
}

// 有効キーワードのラベル更新
function updateActiveKwLabel() {
  var el = document.getElementById('active-kw-label');
  if (!el) return;
  var active = keywords.filter(function(k) { return k.status === '有効'; });
  el.textContent = active.length > 0 ? active.map(function(k) { return k.keyword; }).join(' / ') : '（なし）';
}

// ===== カテゴリーフィルター構築 =====
function buildCategoryFilters() {
  var cats = {};
  allArticles.forEach(function(a) {
    if (a.category) cats[a.category] = (cats[a.category] || 0) + 1;
  });
  var html = '<button class="filter-btn active" onclick="filterByCategory(\'all\',this)">' +
    '<span class="filter-btn-left"><span class="cat-dot" style="background:var(--navy)"></span>すべて</span>' +
    '<span class="count-badge">' + allArticles.length + '</span></button>';
  Object.keys(cats).sort().forEach(function(cat) {
    var c = getCatColor(cat);
    html += '<button class="filter-btn" onclick="filterByCategory(\'' + escQ(cat) + '\',this)">' +
      '<span class="filter-btn-left"><span class="cat-dot" style="background:' + c.dot + '"></span>' + esc(cat) + '</span>' +
      '<span class="count-badge">' + cats[cat] + '</span></button>';
  });
  document.getElementById('category-filters').innerHTML = html;
}

// ===== 統計情報の更新 =====
function updateStats() {
  var processed = allArticles.filter(function(a) { return a.processed === '済'; });
  var catCount = {};
  allArticles.forEach(function(a) { catCount[a.category] = (catCount[a.category] || 0) + 1; });
  var topCat = Object.keys(catCount).sort(function(a, b) { return catCount[b] - catCount[a]; })[0] || '-';
  var scores = processed.filter(function(a) { return Number(a.score) > 0; }).map(function(a) { return Number(a.score); });
  var avg = scores.length ? Math.round(scores.reduce(function(s, v) { return s + v; }, 0) / scores.length) : '-';

  document.getElementById('stat-total').textContent = allArticles.length;
  document.getElementById('stat-processed').textContent = 'AI処理済み ' + processed.length + '件';
  document.getElementById('stat-high').textContent = processed.filter(function(a) { return a.stars === '★★★'; }).length;
  document.getElementById('stat-top-cat').textContent = topCat;
  document.getElementById('stat-avg-score').textContent = avg;

  document.getElementById('count-stars-all').textContent = processed.length;
  document.getElementById('count-stars-3').textContent = processed.filter(function(a) { return a.stars === '★★★'; }).length;
  document.getElementById('count-stars-2').textContent = processed.filter(function(a) { return a.stars === '★★'; }).length;
  document.getElementById('count-stars-1').textContent = processed.filter(function(a) { return a.stars === '★'; }).length;
}

// ===== 記事一覧の描画 =====
function renderArticles() {
  var now = new Date();
  var filtered = allArticles.filter(function(a) {
    if (currentCat !== 'all' && a.category !== currentCat) return false;
    if (currentStars !== 'all-stars' && a.stars !== currentStars) return false;
    if (currentPeriod > 0) {
      var d = new Date(a.pubDate);
      if (isNaN(d) || (now - d) / (1000 * 60 * 60 * 24) > currentPeriod) return false;
    }
    return true;
  });
  // 公開日の新しい順にソート
  filtered.sort(function(a, b) {
    var da = new Date(a.pubDate), db = new Date(b.pubDate);
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return db - da;
  });

  document.getElementById('article-count').textContent =
    filtered.length + '件' + (currentPeriod > 0 ? '（直近' + currentPeriod + '日）' : '');

  if (filtered.length === 0) {
    document.getElementById('articles-container').innerHTML = '<div class="empty">該当する記事がありません。</div>';
    return;
  }

  var html = '<div class="articles">';
  filtered.forEach(function(a) {
    var todayStr = now.getFullYear() + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + ('0' + now.getDate()).slice(-2);
    var isNew = a.fetchedAt && a.fetchedAt.slice(0, 10) === todayStr;
    var c = getCatColor(a.category);
    var score = Number(a.score) || 0;
    var summaryHtml = '';
    if (a.processed === '済' && a.summary) {
      var parts = a.summary.split(/(?=[①②③])/).filter(function(s) { return s.trim(); });
      summaryHtml = '<div class="summary-box"><div class="summary-label">AI サマリー</div><div class="summary-text">';
      parts.slice(0, 3).forEach(function(p) { summaryHtml += esc(p.trim()) + '<br>'; });
      summaryHtml += '</div></div>';
    } else if (a.processed !== '済') {
      summaryHtml = '<p class="unprocessed-note">※ AI処理待ち（夜間バッチ後に表示されます）</p>';
    }
    html += '<div class="article-card' + (a.stars === '★★★' ? ' high' : '') + '">' +
      '<div class="card-top"><div class="card-meta">' +
      (isNew ? '<span class="new-badge">NEW</span>' : '') +
      '<span class="cat-tag" style="background:' + c.bg + ';color:' + c.text + '">● ' + esc(a.category) + '</span>' +
      '<span class="date-text">' + esc(fmtDate(a.pubDate)) + '</span>' +
      '</div><div class="stars-text">' + esc(a.stars || '') + '</div></div>' +
      '<div class="card-title">' + (a.url ? '<a href="' + esc(a.url) + '" target="_blank">' + esc(a.title) + '</a>' : esc(a.title)) + '</div>' +
      (a.source ? '<div class="card-source">出典：' + esc(a.source) + '</div>' : '') +
      summaryHtml +
      '<div class="card-footer">' +
      (score > 0 ? '<div class="relevance-bar"><span class="relevance-label">自社関連度</span><div class="bar-track"><div class="bar-fill" style="width:' + score + '%"></div></div><span class="relevance-pct">' + score + '%</span></div>' : '<div></div>') +
      '</div></div>';
  });
  html += '</div>';
  document.getElementById('articles-container').innerHTML = html;
}

// ===== キーワード管理 =====
function renderKeywords() {
  if (!keywords || keywords.length === 0) {
    document.getElementById('kw-list').innerHTML = '<div style="font-size:11px;color:var(--gray-400)">キーワードがありません</div>';
    return;
  }
  var html = '';
  keywords.forEach(function(kw, i) {
    var isActive = kw.status === '有効';
    html += '<div class="kw-item' + (isActive ? '' : ' inactive') + '">' +
      '<span style="font-size:12px">' + esc(kw.keyword) + '</span>' +
      '<button class="kw-toggle' + (isActive ? '' : ' off') + '" onclick="toggleKw(' + (i + 2) + ',\'' + (isActive ? '無効' : '有効') + '\')">' +
      (isActive ? '有効' : '無効') + '</button></div>';
  });
  document.getElementById('kw-list').innerHTML = html;
}

// キーワード追加
function addNewKeyword() {
  var input = document.getElementById('new-kw-input');
  var kw = input.value.trim();
  var catSelect = document.getElementById('new-kw-cat');
  var cat = catSelect.value;
  if (!kw) { alert('キーワードを入力してください。'); return; }
  if (!cat) { alert('カテゴリーを選択してください。'); return; }
  var btn = document.getElementById('kw-add-btn');
  btn.textContent = '追加中...';
  btn.disabled = true;
  gasPost({ action: 'addKeyword', keyword: kw, category: cat })
    .then(function() {
      input.value = '';
      catSelect.selectedIndex = 0;
      btn.textContent = '＋ キーワードを追加';
      btn.disabled = false;
      reloadKeywords();
    })
    .catch(function(err) {
      btn.textContent = '＋ キーワードを追加';
      btn.disabled = false;
      alert('追加失敗：' + (err.message || String(err)));
    });
}

// キーワード有効/無効切り替え
function toggleKw(rowIndex, newStatus) {
  gasPost({ action: 'toggleKeyword', rowIndex: rowIndex, status: newStatus })
    .then(function() { reloadKeywords(); })
    .catch(function(err) { alert('切替失敗：' + (err.message || String(err))); });
}

// ===== フィルター操作 =====
function filterByCategory(cat, btn) {
  currentCat = cat;
  document.querySelectorAll('#category-filters .filter-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderArticles();
}

function filterByPeriod(val) {
  currentPeriod = parseInt(val);
  renderArticles();
}

function filterByStars(stars, btn) {
  currentStars = stars;
  document.querySelectorAll('.sidebar-section .filter-btn[onclick*="filterByStars"]').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderArticles();
}

// ===== 月次レポート =====
var allReports = [];

function loadReport() {
  document.getElementById('report-container').innerHTML = '<div class="loading"><div class="spinner"></div>レポートを読み込み中...</div>';
  if (!GAS_API_URL) {
    document.getElementById('report-container').innerHTML =
      '<div class="error-box">GAS WebアプリのURLが未設定です。「管理者マニュアル」タブからURLを設定してください。</div>';
    return;
  }
  gasGet('getMonthlyReport')
    .then(function(data) {
      if (!data || !data.exists || !data.reports || data.reports.length === 0) {
        allReports = [];
        document.getElementById('report-meta').textContent = 'レポートはまだ生成されていません';
        document.getElementById('report-month-select').innerHTML = '<option value="">レポートなし</option>';
        document.getElementById('report-container').innerHTML =
          '<div class="no-report"><div class="no-report-icon">📋</div>' +
          '<div class="no-report-text">「今すぐ生成」ボタンを押すと、現在の記事データからレポートを作成します。</div></div>';
        return;
      }
      allReports = data.reports;
      var select = document.getElementById('report-month-select');
      var html = '';
      for (var i = allReports.length - 1; i >= 0; i--) {
        html += '<option value="' + i + '">' + esc(fmtMonth(allReports[i].targetMonth)) + '</option>';
      }
      select.innerHTML = html;
      showReport(allReports.length - 1);
    })
    .catch(function(err) {
      document.getElementById('report-container').innerHTML =
        '<div class="error-box">取得失敗：' + (err.message || String(err)) + '</div>';
    });
}

function switchReport(idx) {
  idx = parseInt(idx);
  if (isNaN(idx) || !allReports[idx]) return;
  showReport(idx);
}

function showReport(idx) {
  var r = allReports[idx];
  document.getElementById('report-meta').textContent = fmtMonth(r.targetMonth) + ' · 生成日時：' + fmtDate(r.createdAt);
  renderReport(r.report);
}

function generateReport() {
  var btn = document.getElementById('report-gen-btn');
  btn.textContent = '⏳ 生成中...';
  btn.disabled = true;
  gasPost({ action: 'generateMonthlyReport' })
    .then(function() {
      btn.textContent = '🔄 今すぐ生成';
      btn.disabled = false;
      loadReport();
    })
    .catch(function(err) {
      btn.textContent = '🔄 今すぐ生成';
      btn.disabled = false;
      alert('生成失敗：' + (err.message || String(err)));
    });
}

function renderReport(r) {
  if (!r) return;
  var maxCat = Math.max.apply(null, (r.categoryBreakdown || []).map(function(c) { return c.count; }));
  var catBars = (r.categoryBreakdown || []).map(function(c) {
    var pct = maxCat > 0 ? Math.round(c.count / maxCat * 100) : 0;
    return '<div class="cat-bar-item"><span class="cat-bar-name">' + esc(c.name) + '</span>' +
      '<div class="cat-bar-track"><div class="cat-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="cat-bar-count">' + c.count + '件</span></div>';
  }).join('');

  var topics = (r.keyTopics || []).map(function(t) { return '<span class="topic-chip">' + esc(t) + '</span>'; }).join('');

  var recs = (r.recommendations || []).map(function(rec) {
    var cls = rec.priority === '高' ? 'high' : rec.priority === '中' ? 'mid' : 'low';
    return '<div class="rec-item ' + cls + '"><div class="rec-title">' + esc(rec.title) +
      '<span class="priority-badge ' + cls + '">' + esc(rec.priority) + '</span></div>' +
      '<div class="rec-detail">' + esc(rec.detail) + '</div></div>';
  }).join('');

  var pickups = (r.pickupArticles || []).map(function(a) {
    var c = getCatColor(a.category);
    return '<div class="pickup-item"><div class="pickup-top">' +
      '<span class="cat-tag" style="background:' + c.bg + ';color:' + c.text + '">● ' + esc(a.category) + '</span>' +
      '<span style="font-size:11px;color:var(--gray-400)">関連度 ' + a.score + '%</span></div>' +
      '<div class="pickup-title">' + (a.url ? '<a href="' + esc(a.url) + '" target="_blank" style="color:inherit;text-decoration:none">' + esc(a.title) + '</a>' : esc(a.title)) + '</div>' +
      '<div class="pickup-summary">' + esc(a.summary) + '</div></div>';
  }).join('');

  document.getElementById('report-container').innerHTML =
    '<div class="report-section"><div class="report-section-title"><span class="section-icon"></span>今月の傾向まとめ</div>' +
    '<p class="trend-text">' + esc(r.trendSummary || '') + '</p></div>' +
    '<div class="report-section"><div class="report-section-title"><span class="section-icon"></span>カテゴリー別件数</div>' +
    '<div class="cat-bars">' + catBars + '</div></div>' +
    '<div class="report-section"><div class="report-section-title"><span class="section-icon"></span>注目トピック</div>' +
    '<div class="topics-list">' + topics + '</div></div>' +
    '<div class="report-section"><div class="report-section-title"><span class="section-icon"></span>自社への提言</div>' +
    '<div class="rec-list">' + recs + '</div></div>' +
    '<div class="report-section"><div class="report-section-title"><span class="section-icon"></span>注目記事ピックアップ</div>' +
    '<div class="pickup-list">' + pickups + '</div></div>';
}

// ===== ユーティリティ関数 =====
function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escQ(str) {
  return String(str || '').replace(/'/g, "\\'");
}

function fmtMonth(str) {
  if (!str) return '';
  if (/^\d{4}年\d{1,2}月$/.test(str)) return str;
  var d = new Date(str);
  if (isNaN(d)) return String(str);
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
}

function fmtDate(str) {
  if (!str) return '';
  var d = new Date(str);
  if (isNaN(d)) return String(str);
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  var h = ('0' + d.getHours()).slice(-2), min = ('0' + d.getMinutes()).slice(-2);
  if (/\d{1,2}:\d{2}/.test(str)) return y + '年' + m + '月' + day + '日 ' + h + ':' + min;
  return y + '年' + m + '月' + day + '日';
}

// ===== サイドバー開閉 =====
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
  document.body.style.overflow = document.getElementById('sidebar').classList.contains('open') ? 'hidden' : '';
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ===== GAS URL設定の保存 =====
function saveGasUrl() {
  var input = document.getElementById('gas-url-input');
  var url = input.value.trim();
  if (!url) {
    alert('URLを入力してください。');
    return;
  }
  localStorage.setItem('ai-dashboard-gas-url', url);
  GAS_API_URL = url;
  var status = document.getElementById('gas-url-status');
  if (status) {
    status.textContent = '保存しました。ページを再読み込みすると反映されます。';
  }
}

// ===== 初期化 =====
// GAS URL設定フォームの初期値をセット
document.addEventListener('DOMContentLoaded', function() {
  var gasUrlInput = document.getElementById('gas-url-input');
  if (gasUrlInput && GAS_API_URL) {
    gasUrlInput.value = GAS_API_URL;
  }
  // データ読み込み開始
  loadData();
});
