import type { ReactNode, RefObject } from 'react';
import type { FaceBox } from '../features/face-recognition/FaceRecognitionAdapter';

/** カメラ映像と顔枠のオーバーレイ（映像は保存しない） */
export function CameraPreview({
  videoRef,
  boxes,
  frameSize,
  mirrored,
  children,
  active,
}: {
  videoRef: RefObject<HTMLVideoElement>;
  boxes?: FaceBox[];
  frameSize?: { w: number; h: number };
  mirrored?: boolean;
  children?: ReactNode;
  active: boolean;
}) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        className={`h-full w-full object-contain ${mirrored ? '-scale-x-100' : ''} ${active ? '' : 'opacity-0'}`}
        playsInline
        muted
        autoPlay
      />
      {active && frameSize && boxes && boxes.length > 0 && (
        <svg className={`pointer-events-none absolute inset-0 h-full w-full ${mirrored ? '-scale-x-100' : ''}`} viewBox={`0 0 ${frameSize.w} ${frameSize.h}`} preserveAspectRatio="xMidYMid meet">
          {boxes.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} fill="none" stroke="#2dd4bf" strokeWidth={Math.max(2, frameSize.w / 200)} rx={8} />
          ))}
        </svg>
      )}
      {children}
    </div>
  );
}
