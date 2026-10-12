import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFaces, useMeetings, useRelations, useStore } from '../app/store';
import { ConfirmDialog, EmptyState, Page, PageHeader, errorMessage, formatDate } from '../components/ui';
import { meetingsForPerson } from '../features/meetings/meetingStats';
import { counterpartId, relationLabelFor, relationsForPerson } from '../features/relations/relations';

const SOURCE_LABEL = { sansan: 'Sansan CSV', generic_csv: 'CSV', manual: '手動登録' } as const;

// SCR-07 人物詳細
export function PersonDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const person = useStore((s) => s.people[id]);
  const peopleById = useStore((s) => s.people);
  const meetings = useMeetings();
  const faces = useFaces();
  const relations = useRelations();
  const deletePerson = useStore((s) => s.deletePerson);
  const deleteFacesOf = useStore((s) => s.deleteFacesOf);
  const deleteRelation = useStore((s) => s.deleteRelation);
  const [confirm, setConfirm] = useState<'delete' | 'faces' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const myMeetings = useMemo(() => meetingsForPerson(meetings, id), [meetings, id]);
  const myFaces = useMemo(() => faces.filter((f) => f.personId === id), [faces, id]);
  const myRelations = useMemo(() => relationsForPerson(relations, id), [relations, id]);

  if (!person) {
    return (
      <>
        <PageHeader title="人物が見つかりません" back="/people" />
        <Page>
          <EmptyState title="削除されたか、存在しない人物です" />
        </Page>
      </>
    );
  }

  const last = myMeetings[0];
  const cardDates = person.sourceRefs.filter((r) => r.businessCardDate);
  const orphanMeetings = myMeetings.filter((m) => m.personIds.length === 1).length;

  return (
    <>
      <PageHeader
        title={person.fullName}
        back
        action={
          <Link to={`/people/${id}/edit`} className="btn-secondary min-h-9 px-3">
            編集
          </Link>
        }
      />
      <Page>
        {params.get('created') && (
          <div className="notice-info space-y-2">
            <p className="font-semibold">登録しました。続けて次のこともできます（任意）</p>
            <div className="flex flex-wrap gap-2">
              <Link to={`/people/${id}/face`} className="btn-secondary min-h-9 px-3">
                顔を登録する
              </Link>
              <Link to={`/meetings/new?person=${id}`} className="btn-secondary min-h-9 px-3">
                面会を記録
              </Link>
            </div>
          </div>
        )}

        <section className="card space-y-1">
          {person.nameKana && <p className="muted text-sm">{person.nameKana}</p>}
          <p className="text-xl font-bold">{person.fullName}</p>
          <p>{[person.companyName, person.department, person.jobTitle].filter(Boolean).join(' / ') || <span className="muted">会社・役職 未登録</span>}</p>
          <div className="grid grid-cols-2 gap-2 pt-2 text-sm">
            <div>
              <div className="muted text-xs">会った回数</div>
              <div className="text-lg font-bold">{myMeetings.length}回</div>
            </div>
            <div>
              <div className="muted text-xs">前回</div>
              <div className="font-semibold">{last ? `${formatDate(last.occurredAt)}${last.location ? `・${last.location}` : ''}` : '—'}</div>
            </div>
          </div>
          {last?.summary && <p className="pt-1 text-sm"><span className="muted">前回の話題：</span>{last.summary}</p>}
          {last?.nextTopic && <p className="text-sm"><span className="muted">次回話すこと：</span>{last.nextTopic}</p>}
          {person.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {person.tags.map((t) => (
                <Link key={t} to={`/people?tag=${encodeURIComponent(t)}`} className="chip">
                  #{t}
                </Link>
              ))}
            </div>
          )}
        </section>

        <Link to={`/meetings/new?person=${id}`} className="btn-primary w-full">
          ✓ 今日会った（面会を記録）
        </Link>

        <section className="card space-y-2 text-sm">
          <h2 className="font-bold">名刺・連絡先</h2>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1">
            {person.email && (<><dt className="muted">メール</dt><dd className="break-all"><a className="underline" href={`mailto:${person.email}`}>{person.email}</a></dd></>)}
            {person.phone && (<><dt className="muted">電話</dt><dd><a className="underline" href={`tel:${person.phone}`}>{person.phone}</a></dd></>)}
            {person.companyAddress && (<><dt className="muted">住所</dt><dd>{person.companyAddress}</dd></>)}
            {person.firstMetAt && (<><dt className="muted">初対面</dt><dd>{formatDate(person.firstMetAt)}</dd></>)}
            {person.firstMetContext && (<><dt className="muted">きっかけ</dt><dd>{person.firstMetContext}</dd></>)}
            {person.organization && (<><dt className="muted">所属団体</dt><dd>{person.organization}</dd></>)}
          </dl>
          {cardDates.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="muted text-xs">名刺交換日（CSV由来・面会回数には含めません）</p>
              {cardDates.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span>{r.businessCardDate}</span>
                  <Link className="btn-ghost min-h-8 px-2 text-xs" to={`/meetings/new?person=${id}&date=${encodeURIComponent(r.businessCardDate!)}`}>
                    面会として記録
                  </Link>
                </div>
              ))}
            </div>
          )}
          <p className="muted text-xs">出典：{[...new Set(person.sourceRefs.map((r) => SOURCE_LABEL[r.source]))].join('、')}</p>
        </section>

        {(person.notes || person.csvNotes) && (
          <section className="card space-y-2 text-sm">
            <h2 className="font-bold">メモ</h2>
            {person.notes && <p className="whitespace-pre-wrap">{person.notes}</p>}
            {person.csvNotes && (
              <p className="whitespace-pre-wrap">
                <span className="muted text-xs">CSVの備考：</span>
                {person.csvNotes}
              </p>
            )}
          </section>
        )}

        <section className="card space-y-2 text-sm">
          <h2 className="font-bold">顔登録</h2>
          {myFaces.length ? (
            <>
              <p>
                登録済み（{myFaces.length}サンプル）・同意確認 {formatDate(myFaces[0].consentAt, true)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to={`/people/${id}/face`} className="btn-secondary min-h-9 px-3">
                  再登録
                </Link>
                <button className="btn-secondary min-h-9 px-3 text-rose-600" onClick={() => setConfirm('faces')}>
                  顔情報だけ削除
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">未登録です。本人の同意を得てから登録してください。</p>
              <Link to={`/people/${id}/face`} className="btn-secondary min-h-9 px-3">
                顔を登録する
              </Link>
            </>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">面会履歴</h2>
          </div>
          {myMeetings.length === 0 ? (
            <p className="muted text-sm">まだ記録がありません。</p>
          ) : (
            myMeetings.map((m) => (
              <Link key={m.id} to={`/meetings/${m.id}/edit`} className="card block p-3 text-sm">
                <p className="font-semibold">
                  {formatDate(m.occurredAt, true)} {m.eventName && `・${m.eventName}`} {m.location && `＠${m.location}`}
                </p>
                {m.summary && <p className="mt-1 whitespace-pre-wrap">{m.summary}</p>}
                {m.nextTopic && <p className="muted mt-1">次回: {m.nextTopic}</p>}
                {m.personIds.length > 1 && (
                  <p className="muted mt-1 text-xs">同席: {m.personIds.filter((p) => p !== id).map((p) => peopleById[p]?.fullName).filter(Boolean).join('、')}</p>
                )}
              </Link>
            ))
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">共通の知人・紹介者</h2>
            <Link to={`/people/${id}/relations/new`} className="btn-ghost min-h-9 px-2 text-sm">
              ＋ 追加
            </Link>
          </div>
          {myRelations.length === 0 ? (
            <p className="muted text-sm">まだ登録がありません。</p>
          ) : (
            <ul className="space-y-2">
              {myRelations.map((r) => {
                const other = counterpartId(r, id);
                const otherP = other ? peopleById[other] : undefined;
                return (
                  <li key={r.id} className="card flex items-center justify-between gap-2 p-3 text-sm">
                    <div>
                      <span className="chip mr-2">{relationLabelFor(r, id)}</span>
                      {otherP ? (
                        <Link to={`/people/${otherP.id}`} className="font-semibold underline">
                          {otherP.fullName}
                        </Link>
                      ) : (
                        <span className="font-semibold">{r.externalPersonName ?? '（不明）'}</span>
                      )}
                      {r.note && <p className="muted mt-1 text-xs">{r.note}</p>}
                    </div>
                    <button className="btn-ghost min-h-8 px-2 text-xs text-rose-600" onClick={() => void deleteRelation(r.id)} aria-label="関係を削除">
                      削除
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {err && <p className="notice-error">{err}</p>}
        <button className="btn-secondary w-full text-rose-600" onClick={() => setConfirm('delete')}>
          この人物を削除
        </button>
      </Page>

      <ConfirmDialog
        open={confirm === 'delete'}
        title={`${person.fullName} を削除`}
        danger
        confirmLabel="削除する"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await deletePerson(id);
            nav('/people', { replace: true });
          } catch (e) {
            setErr(errorMessage(e));
            setConfirm(null);
          }
        }}
      >
        <p>次の関連データも削除・更新されます：</p>
        <ul className="list-disc pl-5">
          <li>顔特徴量 {myFaces.length}件（削除）</li>
          <li>関係 {myRelations.length}件（削除）</li>
          <li>面会記録 {myMeetings.length}件（この人だけの面会 {orphanMeetings}件は削除、他の人との面会からは参加者として外す）</li>
        </ul>
        <p className="notice">削除は取り消せません。元に戻すにはバックアップからの復元が必要です。</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'faces'}
        title="顔情報を削除"
        danger
        confirmLabel="削除する"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await deleteFacesOf(id);
          setConfirm(null);
        }}
      >
        <p>{person.fullName} の顔特徴量（{myFaces.length}件）を削除します。人物情報・面会履歴は残ります。</p>
      </ConfirmDialog>
    </>
  );
}
