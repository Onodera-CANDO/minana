import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraError, startCamera, stopCamera, type CameraErrorKind } from './camera';

export type CameraState = 'idle' | 'starting' | 'running' | 'paused' | 'error';

/**
 * カメラのライフサイクル管理。
 * - start() は利用者操作から呼ぶ
 * - 画面を離れる（アンマウント）・アプリが非表示になると停止し、復帰時は再開確認（paused）
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState<{ kind: CameraErrorKind; message: string } | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');

  const stop = useCallback((next: CameraState = 'idle') => {
    stopCamera(streamRef.current, videoRef.current);
    streamRef.current = null;
    setState(next);
  }, []);

  const start = useCallback(
    async (mode?: 'user' | 'environment') => {
      const f = mode ?? facing;
      if (!videoRef.current) return;
      stopCamera(streamRef.current, videoRef.current);
      setError(null);
      setState('starting');
      try {
        streamRef.current = await startCamera(videoRef.current, f);
        setFacing(f);
        setState('running');
      } catch (e) {
        const kind = e instanceof CameraError ? e.kind : 'unknown';
        setError({ kind, message: e instanceof Error ? e.message : 'カメラを起動できませんでした' });
        setState('error');
      }
    },
    [facing],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && streamRef.current) stop('paused');
    };
    const onHide = () => stop('paused');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      stopCamera(streamRef.current, videoRef.current);
      streamRef.current = null;
    };
  }, [stop]);

  return { videoRef, state, error, facing, start, stop, isRunning: state === 'running' };
}
