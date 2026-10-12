# minana

このリポジトリには次の2つが入っています。

- **ミンアナ Bot**（このページ下部）: Chatwork で睡眠記録を取る小さな Bot
- **[People Memory](./people-memory/README.md)**: ローカルファーストの人脈アシスタント PWA（MVP）。`people-memory/` 配下で独立して動きます

---

# ミンアナ Bot

Chatwork で睡眠記録を取る小さな Bot です。

## セットアップ

1. `npm install`
2. 環境変数を設定:
   - `CHATWORK_TOKEN` - Chatwork API トークン
   - `CHATWORK_ROOM_ID` - 送信先ルーム ID

## 入力形式

`body` はスペース区切り: `睡眠満足度 ? 酒(1=あり/2=なし) その他...`

例: `4 2 1 2 3` → 満足度 4, 酒あり, その他 2 3

## ローカル実行

```bash
# 朝レポート送信
CHATWORK_TOKEN=xxx CHATWORK_ROOM_ID=123 npm run send-morning

# 入力処理（ペイロードを環境変数で渡す）
PAYLOAD_JSON='{"client_payload":{"room_id":"123","body":"4 2 1 2 3","from_account_id":"999"}}' \
  CHATWORK_TOKEN=xxx CHATWORK_ROOM_ID=123 npm run handle-input
```

## GitHub Actions

### シークレット設定

- `CHATWORK_TOKEN`
- `CHATWORK_ROOM_ID`

### repository_dispatch のトリガー例

```bash
curl -X POST \
  -H "Authorization: token YOUR_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/OWNER/REPO/dispatches \
  -d '{"event_type":"minana_input","client_payload":{"room_id":"123","body":"4 2 1 2 3","from_account_id":"999"}}'
```

### ワークフロー

- **minana_morning.yml** - 毎朝 7:00 JST に朝レポートを送信（`workflow_dispatch` でも手動実行可）
- **minana_input.yml** - `repository_dispatch` で入力を受け取り、CSV に追記して返信
