// getUserMedia のラッパー。利用者の操作時だけ起動し、終了時は必ずトラックを停止する。

export type CameraErrorKind = 'insecure' | 'unsupported' | 'denied' | 'not_found' | 'busy' | 'unknown';

export const CAMERA_ERROR_MESSAGE: Record<CameraErrorKind, string> = {
  insecure: 'HTTPS（セキュアな接続）で開いていないため、カメラを使えません。HTTPSのURLで開き直してください。',
  unsupported: 'このブラウザはカメラ取得（getUserMedia）に対応していません。',
  denied: 'カメラの利用が許可されていません。ブラウザまたはOSの設定でこのサイトのカメラを許可してください。',
  not_found: 'カメラが見つかりません。',
  busy: 'カメラを他のアプリが使用中の可能性があります。',
  unknown: 'カメラを起動できませんでした。',
};

export class CameraError extends Error {
  constructor(public kind: CameraErrorKind, cause?: unknown) {
    super(CAMERA_ERROR_MESSAGE[kind]);
    this.cause = cause;
  }
}

export function cameraAvailability(): CameraErrorKind | null {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}

export async function startCamera(video: HTMLVideoElement, facingMode: 'user' | 'environment'): Promise<MediaStream> {
  const pre = cameraAvailability();
  if (pre) throw new CameraError(pre);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false, // 音声は取得しない
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', e);
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('not_found', e);
    if (name === 'NotReadableError' || name === 'AbortError') throw new CameraError('busy', e);
    throw new CameraError('unknown', e);
  }
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => undefined);
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.addEventListener('loadeddata', done, { once: true });
      setTimeout(done, 3000);
    });
  }
  return stream;
}

export function stopCamera(stream: MediaStream | null, video?: HTMLVideoElement | null) {
  stream?.getTracks().forEach((t) => t.stop());
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}
