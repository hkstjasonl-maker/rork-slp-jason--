export type SubtitleCue = {
  startTime: number;
  endTime: number;
  text: string;
};

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.trim().split(':');
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    seconds = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0], 10);
    seconds = parseFloat(parts[1]);
  }

  return hours * 3600 + minutes * 60 + seconds;
}

export function parseVTT(vttText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const clean = vttText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = clean.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length === 0) continue;
    if (lines[0].trim().startsWith('WEBVTT')) continue;

    let timestampLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timestampLineIndex = i;
        break;
      }
    }

    if (timestampLineIndex === -1) continue;

    const timestampLine = lines[timestampLineIndex];
    const [startStr, endStr] = timestampLine.split('-->');
    if (!startStr || !endStr) continue;

    const startTime = parseTimestamp(startStr);
    const endTime = parseTimestamp(endStr);
    const text = lines.slice(timestampLineIndex + 1).join('\n').trim();

    if (text.length > 0) {
      cues.push({ startTime, endTime, text });
    }
  }

  cues.sort((a, b) => a.startTime - b.startTime);
  return cues;
}

export function getCurrentCue(cues: SubtitleCue[], currentTimeSeconds: number): SubtitleCue | null {
  for (const cue of cues) {
    if (cue.startTime <= currentTimeSeconds && currentTimeSeconds < cue.endTime) {
      return cue;
    }
  }
  return null;
}
