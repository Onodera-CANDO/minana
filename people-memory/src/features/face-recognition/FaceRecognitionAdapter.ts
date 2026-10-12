// 顔認識ライブラリを差し替え可能にするための抽象（仕様 6.4）

export type FaceBox = { x: number; y: number; width: number; height: number };

export type DetectedFace = {
  box: FaceBox; // 入力画像のピクセル座標
  /** 検出信頼度 0..1 */
  score: number;
  /** 顔の向き（ラジアン）。取得できない場合 undefined */
  yaw?: number;
  pitch?: number;
  roll?: number;
  embedding: number[] | null;
};

export type DetectionOutput = {
  faces: DetectedFace[];
  inputWidth: number;
  inputHeight: number;
  elapsedMs: number;
};

export interface FaceRecognitionAdapter {
  readonly modelName: string;
  readonly modelVersion: string;
  initialize(): Promise<void>;
  /** フレーム中の顔を検出し、各顔の特徴量を抽出（1人前提の画面でも複数顔を返し得る） */
  detect(frame: HTMLVideoElement | HTMLCanvasElement): Promise<DetectionOutput>;
  extractEmbedding(frame: HTMLVideoElement | HTMLCanvasElement): Promise<number[] | null>;
  compare(a: number[], b: number[]): number;
  backendName(): string;
  dispose(): Promise<void>;
}

export type RecognitionResult =
  | { status: 'candidate'; personId: string; modelScore: number; secondScore: number }
  | { status: 'ambiguous' | 'unknown' | 'no_face' | 'multiple_faces' | 'low_quality' | 'camera_error' | 'disabled'; detail?: string };
