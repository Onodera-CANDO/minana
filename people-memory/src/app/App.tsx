import { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { useStore } from './store';
import { AppRoutes } from './routes';
import { SetupPage } from '../pages/SetupPage';
import { LockPage } from '../pages/LockPage';
import { useAutoLock } from './useAutoLock';

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const init = useStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  useAutoLock();

  if (status === 'loading') return <p className="muted p-6 text-center">読み込み中…</p>;
  if (status === 'error')
    return (
      <main className="mx-auto max-w-xl p-4">
        <p className="notice-error">
          ローカルデータベースを開けませんでした（{error}）。プライベートブラウズでは保存できない場合があります。
        </p>
      </main>
    );
  if (status === 'setup') return <SetupPage />;
  if (status === 'locked') return <LockPage />;
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
