/**
 * 朝のメッセージ送信（GitHub Actions の cron から実行）
 * Chatwork へ朝入力依頼を送るだけ
 */

import { sendMessage } from "./chatwork.js";

const TOKEN = process.env.CHATWORK_TOKEN;
const ROOM_ID = process.env.CHATWORK_ROOM_ID;

const MORNING_MESSAGE = `【ミンアナ】朝入力お願いします（数字5つだけ）
① 睡眠満足度（1-10）
② 夜中の覚醒回数
③ 酒（0=なし 1=少量 2=多め）
④ カフェイン予定（杯数：0-9）
⑤ 今の気分（1-10）
例：4 2 1 2 3`;

async function main() {
  if (!ROOM_ID) {
    throw new Error("CHATWORK_ROOM_ID が必要です");
  }
  if (!TOKEN) {
    throw new Error("CHATWORK_TOKEN が必要です");
  }

  const result = await sendMessage(TOKEN, ROOM_ID, MORNING_MESSAGE);
  if (!result.success) {
    console.error("Chatwork send failed:", result.error);
    process.exit(1);
  }

  console.log("Morning message sent.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
