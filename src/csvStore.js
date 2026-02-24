import fs from "node:fs";
import path from "node:path";

const DATA_PATH = path.resolve("data/minana.csv");

export function ensureCsv() {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(
      DATA_PATH,
      "date,sleep_score,wake_count,alcohol,caffeine_plan,mood,room_id,from_account_id\n",
      "utf8"
    );
  }
}

/**
 * 互換性のため：
 * - 旧CSV（room_id無し）の行があっても読み込めるようにする
 */
export function readAllRows() {
  ensureCsv();
  const lines = fs.readFileSync(DATA_PATH, "utf8").trim().split("\n");
  const data = lines.slice(1).filter(Boolean);

  return data.map((line) => {
    const cols = line.split(",");
    const [
      date,
      sleep_score,
      wake_count,
      alcohol,
      caffeine_plan,
      mood,
      room_id,
      from_account_id,
    ] = cols;

    return {
      date: date || "",
      sleep_score: Number(sleep_score),
      wake_count: Number(wake_count),
      alcohol: Number(alcohol),
      caffeine_plan: Number(caffeine_plan),
      mood: Number(mood),
      room_id: room_id || "", // 旧データは空になる
      from_account_id: from_account_id || "",
    };
  });
}

export function appendRow(row) {
  ensureCsv();
  fs.appendFileSync(DATA_PATH, row + "\n", "utf8");
}

/**
 * 指定ユーザー（+ room）で直近N件
 */
export function readLastNByUser({ roomId, fromAccountId, limit = 3 }) {
  const rows = readAllRows();

  const filtered = rows.filter((r) => {
    // room_id が空（旧行）の場合は from_account_id のみで許容
    const roomOk = !r.room_id || r.room_id === String(roomId);
    const userOk = r.from_account_id === String(fromAccountId);
    return roomOk && userOk;
  });

  return filtered.slice(-limit);
}
