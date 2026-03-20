import { Platform } from 'react-native';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { log } from '@/lib/logger';

// NOTE: ffmpeg-kit-react-native requires a custom development build (not compatible with Expo Go).
// In Expo Go, watermark burning is skipped and the original video is used as-is.
// In production builds, install ffmpeg-kit-react-native and this module will use it automatically.
// Run: npx expo install ffmpeg-kit-react-native (requires custom dev client / EAS build)

let FFmpegKit: any = null;
let ReturnCode: any = null;
let isFFmpegAvailable = false;

try {
  const ffmpegModule = require('ffmpeg-kit-react-native');
  FFmpegKit = ffmpegModule.FFmpegKit;
  ReturnCode = ffmpegModule.ReturnCode;
  isFFmpegAvailable = true;
  log('[VideoProcessing] ffmpeg-kit-react-native loaded successfully');
} catch {
  log('[VideoProcessing] ffmpeg-kit-react-native not available (expected in Expo Go)');
}

export function getFFmpegAvailability(): boolean {
  return isFFmpegAvailable;
}

function formatDateTime(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

export interface WatermarkOptions {
  exerciseName: string;
  patientName?: string;
}

export interface ProcessingResult {
  uri: string;
  wasProcessed: boolean;
}

export async function burnWatermarkIntoVideo(
  inputUri: string,
  options: WatermarkOptions
): Promise<ProcessingResult> {
  if (Platform.OS === 'web') {
    log('[VideoProcessing] Web platform — skipping watermark burn');
    return { uri: inputUri, wasProcessed: false };
  }

  if (!isFFmpegAvailable || !FFmpegKit || !ReturnCode) {
    log('[VideoProcessing] FFmpeg not available — returning original video');
    return { uri: inputUri, wasProcessed: false };
  }

  try {
    const inputInfo = await LegacyFileSystem.getInfoAsync(inputUri);
    if (!inputInfo.exists) {
      log('[VideoProcessing] Input file does not exist:', inputUri);
      return { uri: inputUri, wasProcessed: false };
    }
    log('[VideoProcessing] Input file size:', (inputInfo as any).size);

    const dateTime = formatDateTime();
    const watermarkLine1 = escapeFFmpegText(
      `${options.exerciseName} · ${dateTime}`
    );
    const watermarkLine2 = escapeFFmpegText(
      options.patientName
        ? `${options.patientName} · Recorded with NanoHab`
        : 'Recorded with NanoHab'
    );

    const outputUri = `${LegacyFileSystem.cacheDirectory}watermarked_${Date.now()}.mp4`;

    const drawtext1 = `drawtext=text='${watermarkLine1}':fontsize=14:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=5:x=12:y=32`;
    const drawtext2 = `drawtext=text='${watermarkLine2}':fontsize=12:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4:x=12:y=58`;

    const cmd = `-i "${inputUri}" -c:v libx264 -preset ultrafast -crf 28 -c:a aac -movflags +faststart -vf "${drawtext1},${drawtext2}" "${outputUri}"`;

    log('[VideoProcessing] Running FFmpeg command');

    const session = await FFmpegKit.execute(cmd);
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      const outputInfo = await LegacyFileSystem.getInfoAsync(outputUri);
      if (outputInfo.exists && (outputInfo as any).size > 0) {
        log('[VideoProcessing] Watermark burn successful, output size:', (outputInfo as any).size);
        return { uri: outputUri, wasProcessed: true };
      } else {
        log('[VideoProcessing] FFmpeg succeeded but output file is empty/missing');
        return { uri: inputUri, wasProcessed: false };
      }
    } else {
      const output = await session.getOutput();
      log('[VideoProcessing] FFmpeg failed, return code:', returnCode, 'output:', output);
      return { uri: inputUri, wasProcessed: false };
    }
  } catch (e) {
    log('[VideoProcessing] Exception during watermark burn:', e);
    return { uri: inputUri, wasProcessed: false };
  }
}
