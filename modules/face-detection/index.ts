import { EventEmitter, type EventSubscription } from 'expo-modules-core';
import FaceDetectionModule from './src/FaceDetectionModule';

type FaceDetectionEvents = {
  onFaceDetected: (event: FaceDetectionResult) => void;
};

const emitter = new EventEmitter<FaceDetectionEvents>(FaceDetectionModule);

export interface FaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetectionResult {
  hasFace: boolean;
  bounds: FaceBounds | null;
}

export function startDetection(): void {
  FaceDetectionModule.startDetection();
}

export function stopDetection(): void {
  FaceDetectionModule.stopDetection();
}

export function addFaceDetectionListener(
  callback: (event: FaceDetectionResult) => void
): EventSubscription {
  return emitter.addListener('onFaceDetected', callback);
}

export { FaceDetectionModule };
