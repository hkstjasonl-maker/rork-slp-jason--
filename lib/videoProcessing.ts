import * as FileSystem from 'expo-file-system';

export function getFFmpegAvailability(): boolean {
  return false;
}

export async function burnWatermarkIntoVideo(
  inputUri: string,
  exerciseName?: string,
  patientName?: string,
): Promise<{ uri: string; wasProcessed: boolean }> {
  return { uri: inputUri, wasProcessed: false };
}
