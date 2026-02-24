import { appendRow, readLastNByUser } from "./csvStore.js";
import { sendChatworkMessage } from "./chatwork.js";

const roomIdEnv = process.env.CHATWORK_ROOM_ID;

// GitHub repository_dispatch payload
const payload = JSON.parse(process.env.MINANA_PAYLOAD || "{}");
const cp = payload.client_payload || {};

const roomId = cp.room_id || roomIdEnv;
const body = (cp.body || "").trim();
const fromAccountId = String(cp.from_account_id || "");

if (!roomId) throw new Error("room_id / CHATWORK_ROOM_ID is missing");
if (!body) throw new Error("payload body is missing");

// Accept: "4 2 1 2 3" or "4,2,1,2,3"
const parts = body.replace(/,/g, " ").split(/\s+/).filter(Boolean);

if (parts.length < 5) {
  await sendChatworkMessage(
    roomId,
    "【ミンアナ】入力が足りないっす。例：4 2 1 2 3（数字5つ）"
  );
  process.exit(0);
}

const [sleepScore, wakeCount, alcohol, caffeinePlan, mood] = parts
  .slice(0, 5)
  .map(Number);

function inRange(n, min, max) {
  return Number.isFinite(n) && n >= min && n <= max;
}

const ok =
  inRange(sleepScore, 1, 10) &&
  inRange(wakeCount, 0, 20) &&
  inRange(alcohol, 0, 2) &&
  inRange(caffeinePlan, 0, 9) &&
  inRange(mood, 1, 10);

if (!ok) {
  await sendChatworkMessage(
    roomId,
    "【ミンアナ】数字の範囲がおかしいかも。sleep(1-10) wake(0+) 酒(0-2) カフェイン(0-9) 気分(1-10)"
  );
  process.exit(0);
}

// dateは「入力された日」でOK（朝入力運用）
const date = new Date().toISOString().slice(0, 10);

// room_id を保存（複数人が同室でも後から分離できる）
appendRow(
  `${date},${sleepScore},${wakeCount},${alcohol},${caffeinePlan},${mood},${String(
    roomId
  )},${fromAccountId}`
);

// ★ここが重要：送信者ごとに直近3件で分析
const last3 = readLastNByUser({
  roomId: String(roomId),
  fromAccountId,
  limit: 3,
});

const avg = (arr, key) =>
  arr.length
    ? (arr.reduce((a, r) => a + r[key], 0) / arr.length).toFixed(1)
    : null;

const avgSleep = avg(last3, "sleep_score") ?? "N/A";

const withAlcohol = last3.filter((r) => r.alcohol > 0);
const withoutAlcohol = last3.filter((r) => r.alcohol === 0);

const alcAvg = avg(withAlcohol, "sleep_score");
const noAlcAvg = avg(withoutAlcohol, "sleep_score");

let compareLine = "・酒あり/なし比較：データ不足（どっちかしかない）";
if (alcAvg !== null && noAlcAvg !== null) {
  compareLine = `・酒あり平均=${alcAvg} / 酒なし平均=${noAlcAvg}（あなたの直近${last3.length}件）`;
}

let hint = "今日の提案：起床後すぐ外光5分。地味だけど効く。";
if (caffeinePlan >= 4)
  hint = "今日の提案：カフェイン多め予定。14時以降ゼロに寄せると勝ち。";
if (alcohol === 2)
  hint =
    "今日の提案：酒多めの日は覚醒しやすい。量そのままなら寝る3時間前までに寄せよう。";

const reply = `【ミンアナ記録OK】（個別分析）
・あなたの直近${last3.length}回の睡眠満足度平均：${avgSleep}
${compareLine}
・今日の入力：sleep=${sleepScore}, wake=${wakeCount}, 酒=${alcohol}, カフェイン予定=${caffeinePlan}, 気分=${mood}

${hint}`;

await sendChatworkMessage(roomId, reply);
