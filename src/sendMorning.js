/**
 * 朝のレポート送信（GitHub Actions の cron から実行）
 * 直近3件の分析結果を Chatwork に送信する
 */

import { analyzeLastN } from "./csvStore.js";
import { sendMessage } from "./chatwork.js";

const TOKEN = process.env.CHATWORK_TOKEN;
const ROOM_ID = process.env.CHATWORK_ROOM_ID;

const MORNING_WORDS = [
  "おはようございます！今日も良い1日を",
  "おはよう！無理せずいきましょう",
  "おはよう。穏やかな朝ですね",
  "おはようございます。コーヒーで一息どうぞ",
  "おはよう！今日の調子はいかがですか？",
];

function getMorningWord() {
  const idx = new Date().getDate() % MORNING_WORDS.length;
  return MORNING_WORDS[idx];
}

function formatMorningReport(analysis) {
  const lines = [];

  lines.push("[info][title]ミンアナ 朝レポート[/title]");

  if (analysis.count === 0) {
    lines.push("まだデータがありません。");
    lines.push("入力例: 4 2 1 2 3（睡眠満足度 ？ 酒1=あり/2=なし その他）");
  } else {
    const avg = analysis.avgSatisfaction.toFixed(1);
    lines.push(`【直近${analysis.count}件】睡眠満足度の平均: ${avg}`);

    const ac = analysis.alcoholComparison;
    if (ac) {
      if (ac.with && ac.without) {
        lines.push(
          `【酒あり/なし比較】酒あり: 平均${ac.with.avg.toFixed(1)} (${
            ac.with.count
          }件) / 酒なし: 平均${ac.without.avg.toFixed(1)} (${
            ac.without.count
          }件)`
        );
      } else if (ac.with) {
        lines.push(
          `【酒あり】平均${ac.with.avg.toFixed(1)} (${ac.with.count}件)`
        );
      } else if (ac.without) {
        lines.push(
          `【酒なし】平均${ac.without.avg.toFixed(1)} (${ac.without.count}件)`
        );
      }
    }
  }

  lines.push(`【今日の一言】${getMorningWord()}`);
  lines.push("[/info]");

  return lines.join("\n");
}

async function main() {
  if (!TOKEN || !ROOM_ID) {
    console.error("CHATWORK_TOKEN と CHATWORK_ROOM_ID を設定してください");
    process.exit(1);
  }

  const analysis = analyzeLastN(3);
  const message = formatMorningReport(analysis);

  const result = await sendMessage(TOKEN, ROOM_ID, message);
  if (!result.success) {
    console.error("Chatwork send failed:", result.error);
    process.exit(1);
  }

  console.log("Morning report sent.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
