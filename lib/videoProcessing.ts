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
  const FFmpegModule = require('ffmpeg-kit-react-native');
  FFmpegKit = FFmpegModule.FFmpegKit;
  ReturnCode = FFmpegModule.ReturnCode;
  isFFmpegAvailable = true;
  console.log('WATERMARK: FFmpeg loaded successfully');
} catch (e: any) {
  isFFmpegAvailable = false;
  console.log('WATERMARK: FFmpeg not available -', e?.message ?? 'unknown error');
}

export function getFFmpegAvailability(): boolean {
  return isFFmpegAvailable;
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
  exerciseName: string,
  patientName?: string
): Promise<ProcessingResult> {
  console.log('WATERMARK: Starting burnWatermarkIntoVideo');
  console.log('WATERMARK: isFFmpegAvailable =', isFFmpegAvailable);
  console.log('WATERMARK: inputUri =', inputUri);
  console.log('WATERMARK: exerciseName =', exerciseName, '| patientName =', patientName);

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

    const timestamp = new Date().toLocaleString('en-HK');
    const line1 = escapeFFmpegText(exerciseName || 'Exercise');
    const line2 = escapeFFmpegText(`${patientName || 'Patient'} | ${timestamp}`);
    const line3 = escapeFFmpegText('Recorded via NanoHab 醫家動');
    const line4 = escapeFFmpegText('www.dravive.com/nanohab');

    const outputUri = `${LegacyFileSystem.cacheDirectory}watermarked_${Date.now()}.mp4`;

    const inputPath = `"${inputUri}"`;
    const outputPath = `"${outputUri}"`;

    const cmd = `-i ${inputPath} -vf "drawtext=text='${line1}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:box=1:boxcolor=black@0.35:boxborderw=5:x=(w-text_w)/2:y=h-160,drawtext=text='${line2}':fontsize=20:fontcolor=white:borderw=2:bordercolor=black:box=1:boxcolor=black@0.35:boxborderw=5:x=(w-text_w)/2:y=h-125,drawtext=text='${line3}':fontsize=18:fontcolor=white:borderw=1:bordercolor=black:box=1:boxcolor=black@0.35:boxborderw=4:x=(w-text_w)/2:y=h-90,drawtext=text='${line4}':fontsize=16:fontcolor=white@0.85:borderw=1:bordercolor=black:x=(w-text_w)/2:y=h-60" -codec:a copy -y ${outputPath}`;

    console.log('WATERMARK: Executing command:', cmd);
    log('[VideoProcessing] Running FFmpeg command');

    const session = await FFmpegKit.execute(cmd);
    const returnCode = await session.getReturnCode();

    console.log('WATERMARK: FFmpeg result - returnCode:', returnCode);
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
      console.log('WATERMARK: FFmpeg execution failed -', output);
      log('[VideoProcessing] FFmpeg failed, return code:', returnCode, 'output:', output);
      return { uri: inputUri, wasProcessed: false };
    }
  } catch (e) {
    log('[VideoProcessing] Exception during watermark burn:', e);
    return { uri: inputUri, wasProcessed: false };
  }
}
