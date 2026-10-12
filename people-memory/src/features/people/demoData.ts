import type { Meeting, Person } from '../../types';
import { newId } from '../../app/id';

// デモ用ダミー人物（実在の人物ではありません）
const DEMO = [
  ['山田 太郎（ダミー）', 'やまだ たろう', '株式会社サンプル商事', '営業部', '部長', 'taro.yamada@example.com', ['見込み客', '交流会']],
  ['佐藤 花子（ダミー）', 'さとう はなこ', 'テスト工業株式会社', '経営企画室', '代表取締役', 'hanako.sato@example.net', ['経営者']],
  ['鈴木 一郎（ダミー）', 'すずき いちろう', 'ダミーデザイン合同会社', '', 'ディレクター', 'ichiro@example.org', ['制作会社']],
  ['高橋 美咲（ダミー）', 'たかはし みさき', '架空システムズ株式会社', '開発部', 'エンジニア', '', ['エンジニア']],
  ['田中 健（ダミー）', 'たなか けん', 'フィクション不動産株式会社', '', '取締役', 'ken.tanaka@example.com', ['経営者', 'ゴルフ']],
] as const;

export function buildDemoData(): { people: Person[]; meetings: Meeting[] } {
  const now = new Date();
  const people: Person[] = DEMO.map(([fullName, nameKana, companyName, department, jobTitle, email, tags]) => ({
    id: newId(),
    fullName,
    nameKana,
    companyName,
    department: department || undefined,
    jobTitle,
    email: email || undefined,
    tags: [...tags, 'デモ'],
    notes: 'デモ用のダミーデータです',
    sourceRefs: [{ source: 'manual' }],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }));
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
  const meetings: Meeting[] = [
    { id: newId(), personIds: [people[0].id, people[1].id], occurredAt: day(30), location: '渋谷（架空会場）', eventName: 'デモ経営者交流会', summary: '新規事業の話', nextTopic: '資料を送る', createdAt: day(30), updatedAt: day(30) },
    { id: newId(), personIds: [people[0].id], occurredAt: day(3), location: 'オンライン', summary: '見積もりの相談', nextTopic: '提案内容の確認', followUpDate: day(-7).slice(0, 10), createdAt: day(3), updatedAt: day(3) },
    { id: newId(), personIds: [people[2].id], occurredAt: day(10), eventName: 'デモ勉強会', createdAt: day(10), updatedAt: day(10) },
  ];
  return { people, meetings };
}
