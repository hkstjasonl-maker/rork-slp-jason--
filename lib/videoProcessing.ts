import { Platform } from 'react-native';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { log } from '@/lib/logger';

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
  return `${yyyy}-${mm}-${dd} ${hh}\\:${min}`;
}

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "\\\\'")
    .replace(/:/g, '\\\\:')
    .replace(/\[/g, '\\\\[')
    .replace(/\]/g, '\\\\]')
    .replace(/%/g, '%%');
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
    log('[VideoProcessing] FFmpeg not available — watermark will NOT be burned');
    log('[VideoProcessing] Install ffmpeg-kit-react-native and use EAS build to enable');
    return { uri: inputUri, wasProcessed: false };
  }

  try {
    let normalizedInput = inputUri;
    if (Platform.OS === 'ios' && !inputUri.startsWith('file://')) {
      normalizedInput = 'file://' + inputUri;
    }

    const inputInfo = await LegacyFileSystem.getInfoAsync(normalizedInput);
    if (!inputInfo.exists) {
      log('[VideoProcessing] Input file does not exist:', normalizedInput);
      return { uri: inputUri, wasProcessed: false };
    }
    log('[VideoProcessing] Input file size:', (inputInfo as any).size, 'bytes');

    if ((inputInfo as any).size === 0) {
      log('[VideoProcessing] Input file is empty');
      return { uri: inputUri, wasProcessed: false };
    }

    const dateTime = formatDateTime();

    const line1 = escapeFFmpegText(`${options.exerciseName} | ${dateTime}`);

    const line2 = escapeFFmpegText(
      options.patientName
        ? `${options.patientName} | Recorded with SLP Jason`
        : 'Recorded with SLP Jason'
    );

    const line3 = escapeFFmpegText('SLP Jason Lai');

    const outputUri = `${LegacyFileSystem.cacheDirectory}watermarked_${Date.now()}.mp4`;

    // FFmpeg expects plain paths (no file:// prefix) on iOS
    const ffmpegInput = normalizedInput.replace('file://', '');
    const ffmpegOutput = outputUri.replace('file://', '');

    // Top-left: exercise name + timestamp with semi-transparent background box
    const dt1 = `drawtext=text='${line1}':fontsize=16:fontcolor=white:borderw=2:bordercolor=black:x=16:y=20:box=1:boxcolor=black@0.55:boxborderw=6`;

    // Below line 1: patient name + branding
    const dt2 = `drawtext=text='${line2}':fontsize=14:fontcolor=white:borderw=1:bordercolor=black:x=16:y=48:box=1:boxcolor=black@0.55:boxborderw=5`;

    // Bottom-right: copyright
    const dt3 = `drawtext=text='${line3}':fontsize=11:fontcolor=white@0.8:borderw=1:bordercolor=black:x=w-tw-16:y=h-30:box=1:boxcolor=black@0.45:boxborderw=4`;

    const cmd = `-y -i "${ffmpegInput}" -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -movflags +faststart -vf "${dt1},${dt2},${dt3}" "${ffmpegOutput}"`;

    log('[VideoProcessing] Running FFmpeg command...');
    log('[VideoProcessing] Input:', ffmpegInput);
    log('[VideoProcessing] Output:', ffmpegOutput);

    const session = await FFmpegKit.execute(cmd);
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      // Check output exists
      let outputInfo = await LegacyFileSystem.getInfoAsync(outputUri);
      if (!outputInfo.exists) {
        outputInfo = await LegacyFileSystem.getInfoAsync('file://' + ffmpegOutput);
      }

      if (outputInfo.exists && (outputInfo as any).size > 0) {
        log('[VideoProcessing] Watermark burn SUCCESS, output size:', (outputInfo as any).size);

        // Clean up input file to save space
        try {
          await LegacyFileSystem.deleteAsync(normalizedInput, { idempotent: true });
        } catch {}

        return {
          uri: outputInfo.uri || outputUri,
          wasProcessed: true,
        };
      }

      log('[VideoProcessing] FFmpeg succeeded but output missing/empty');
      return { uri: inputUri, wasProcessed: false };
    } else {
      const output = await session.getOutput();
      const failTrace = await session.getFailStackTrace();
      log('[VideoProcessing] FFmpeg FAILED, code:', returnCode);
      log('[VideoProcessing] Output:', output?.substring(0, 500));
      if (failTrace) log('[VideoProcessing] Trace:', failTrace.substring(0, 300));

      // Diagnostic: test if FFmpeg works at all with a simple copy
      log('[VideoProcessing] Running diagnostic copy test...');
      const diagOutput = `${LegacyFileSystem.cacheDirectory}diag_${Date.now()}.mp4`;
      const diagCmd = `-y -i "${ffmpegInput}" -c copy "${diagOutput.replace('file://', '')}"`;
      const diagSession = await FFmpegKit.execute(diagCmd);
      const diagRC = await diagSession.getReturnCode();
      if (ReturnCode.isSuccess(diagRC)) {
        log('[VideoProcessing] Diagnostic copy OK — FFmpeg works but drawtext filter failed');
        log('[VideoProcessing] This is likely a missing font issue on iOS');
        try {
          await LegacyFileSystem.deleteAsync(diagOutput, { idempotent: true });
        } catch {}
      } else {
        log('[VideoProcessing] Diagnostic copy also FAILED — FFmpeg may not be properly installed');
      }

      return { uri: inputUri, wasProcessed: false };
    }
  } catch (error) {
    log('[VideoProcessing] Unexpected error:', error);
    return { uri: inputUri, wasProcessed: false };
  }
}
