# Playwrightで「競合サイト変更検知SaaS」を作った話 — 無料プランで3URLまで監視できます

## はじめに

マーケターや事業開発の方なら一度は思ったことがあるはずです。

> 「競合が値段変えたとき、すぐ知りたいんだけど…毎日手動でチェックするのも限界だよな」

そこで作ったのが **WebMonitor** です。URLを登録するだけで、競合サイトの変更を自動検知してSlackやメールに通知するSaaSです。

https://web-change-monitor-one.vercel.app

---

## 何ができるのか

- **URLを登録するだけ**で変更を自動検知
- **Slack Webhook** で即時通知（Proプラン）
- **CSSセレクタ**で「価格表示エリアだけ監視」が可能
- **ログイン後のページ**も監視可能（Playwright + Cookie）
- **変更前後の差分**をテキストで記録・表示

### ユースケース例

| 用途 | 具体例 |
|------|--------|
| 競合価格監視 | 競合の料金ページを5分ごとにチェック |
| 採用状況把握 | 競合企業の採用ページの求人増減を追う |
| IR・プレスリリース | 投資先企業の発表をリアルタイムで受け取る |
| 自社サービス監視 | 本番環境の重要ページが壊れていないか確認 |

---

## 技術スタック

```
Frontend: Vanilla HTML/CSS/JS（ランディングページ兼ダッシュボード）
Backend:  Node.js + Express → Vercel Serverless Functions
監視エンジン: Playwright + node-cron
ストレージ: Upstash Redis（Vercel KV）
決済:       Stripe
Chrome拡張: Manifest V3
```

### なぜ Playwright を選んだか

一般的なHTTP fetchだと、JavaScriptで動的に生成されるコンテンツや、ログイン後のページが取得できません。Playwrightを使うことで、実際のブラウザと同等の動作が可能になります。

```javascript
// 監視エンジンの核心部分（monitor.js）
const { chromium } = require('playwright-core');
const chromiumExec = require('@sparticuz/chromium');

async function fetchPage(url, selector = null, cookies = null) {
  const browser = await chromium.launch({
    args: chromiumExec.args,
    executablePath: await chromiumExec.executablePath(),
    headless: true,
  });
  
  const context = await browser.newContext();
  if (cookies) await context.addCookies(cookies);
  
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  
  // CSSセレクタで部分取得
  const content = selector
    ? await page.$eval(selector, el => el.innerText).catch(() => '')
    : await page.evaluate(() => document.body.innerText);
  
  await browser.close();
  return content;
}
```

### 変更検知のロジック

```javascript
const crypto = require('crypto');

function hashContent(text) {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

async function checkUrl(urlRecord) {
  const newContent = await fetchPage(urlRecord.url, urlRecord.selector);
  const newHash = hashContent(newContent);
  
  if (urlRecord.last_hash && urlRecord.last_hash !== newHash) {
    // 変更あり → 差分を計算して通知
    const diff = computeDiff(urlRecord.last_content, newContent);
    await notify(urlRecord, diff);
    await saveHistory(urlRecord.id, diff);
  }
  
  // ハッシュを更新
  await updateRecord(urlRecord.id, { last_hash: newHash, last_content: newContent });
}
```

### Vercel Cron で定期実行

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/check",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Vercelの無料プランでは5分間隔のCronが使えます。これがProプランの「最短5分チェック」を実現しています。

### Chrome拡張（Manifest V3）

「今見ているページを監視に追加」をワンクリックで実現するChrome拡張も作りました。

```javascript
// popup.js（抜粋）
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  document.getElementById('url').textContent = tab.url;
  document.getElementById('name').value = tab.title;
});

document.getElementById('addBtn').addEventListener('click', async () => {
  const apiKey = await getStoredApiKey();
  const serverUrl = await getStoredServerUrl();
  
  const res = await fetch(`${serverUrl}/api/urls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({
      name: document.getElementById('name').value,
      url: tab.url,
      interval_minutes: parseInt(document.getElementById('interval').value),
    }),
  });
  // ...
});
```

---

## 料金プランの設計

| | Free | Pro |
|--|------|-----|
| 監視URL数 | 3件 | 無制限 |
| チェック間隔 | 60分 | 最短5分 |
| 通知 | メールのみ | Slack + メール |
| 変更履歴 | 7日間 | 無制限 |
| 月額 | 無料 | ¥980 |

フリープランでまず試してもらい、「もっと監視したい」「Slackに通知したい」となったときにProに誘導するモデルです。

---

## 実際に使ってみる

1. https://web-change-monitor-one.vercel.app にアクセス
2. メールアドレスを入力してAPIキーを発行（無料）
3. 監視したいURLを追加するだけ

Chrome拡張を使うと、気になるページを開いてワンクリックで登録できます（現在Chrome Web Store申請中）。

---

## 今後やりたいこと

- [ ] Webhook通知（Discord, LINE Notify対応）
- [ ] 変更検知の感度設定（微細な変更を無視するオプション）
- [ ] チーム共有機能（同一APIキーを複数人で使用）
- [ ] スクリーンショット差分表示

---

## おわりに

「Playwrightって監視ツールとめちゃくちゃ相性いいな」というのが作ってみた感想です。JavaScript レンダリング・Cookie認証・特定要素の抽出、全部Playwrightがカバーしてくれます。

Playwright をもっと深く学びたい方は、現在Zennで [Playwright完全ガイド](https://zenn.dev/books/72ebdf1876a09e) も執筆中です。よかったら覗いてみてください。

フィードバックや「こんな機能が欲しい」などあれば、コメントかTwitter（[@vcareer_shukatsu](https://twitter.com/vcareer_shukatsu)）でお知らせください！
