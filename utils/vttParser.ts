export type SubtitleCue = {
  startTime: number;
  endTime: number;
  text: string;
};

function parseTimestamp(timestamp: string): number {
  const cleaned = timestamp.trim().replace(',', '.');
  const parts = cleaned.split(':');
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

function detectFormat(text: string): 'vtt' | 'srt' | 'txt' {
  const clean = text.trim();
  if (clean.startsWith('WEBVTT')) return 'vtt';
  if (/^\d+\s*\n\d{2}:\d{2}/.test(clean)) return 'srt';
  if (clean.includes('-->')) return 'vtt';
  if (/\d{1,2}:\d{2}/.test(clean)) return 'txt';
  return 'vtt';
}

function parseVTTOrSRT(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
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

  return cues;
}

function parseTxtTimestamps(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim().length > 0);

  const rangePattern = /^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*[:\-–—]?\s*(.+)$/;

  const singleTimestampPattern = /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?\s*[:\-–—]?\s*(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const rangeMatch = line.match(rangePattern);
    if (rangeMatch) {
      const startTime = parseTimestamp(rangeMatch[1]);
      const endTime = parseTimestamp(rangeMatch[2]);
      const cueText = rangeMatch[3].trim();
      if (cueText.length > 0) {
        cues.push({ startTime, endTime, text: cueText });
      }
      continue;
    }

    const singleMatch = line.match(singleTimestampPattern);
    if (singleMatch) {
      const startTime = parseTimestamp(singleMatch[1]);
      const cueText = singleMatch[2].trim();
      if (cueText.length > 0) {
        cues.push({ startTime, endTime: 0, text: cueText });
      }
    }
  }

  for (let i = 0; i < cues.length; i++) {
    if (cues[i].endTime === 0) {
      if (i < cues.length - 1) {
        cues[i].endTime = cues[i + 1].startTime;
      } else {
        cues[i].endTime = cues[i].startTime + 5;
      }
    }
  }

  return cues;
}

function parseBracketedFormat(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim().length > 0);

  const pattern = /^\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]\s*(.*)$/;

  for (const line of lines) {
    const match = line.trim().match(pattern);
    if (match) {
      const startTime = parseTimestamp(match[1]);
      const endTime = parseTimestamp(match[2]);
      const cueText = (match[3] || '').trim();
      if (cueText.length > 0) {
        cues.push({ startTime, endTime, text: cueText });
      }
    }
  }

  console.log('[vttParser] parseBracketedFormat found', cues.length, 'cues');
  return cues;
}

export function parseVTT(vttText: string): SubtitleCue[] {
  const format = detectFormat(vttText);
  console.log('[vttParser] Detected format:', format, 'text length:', vttText.length);

  let cues: SubtitleCue[];

  if (format === 'txt') {
    cues = parseTxtTimestamps(vttText);
  } else {
    cues = parseVTTOrSRT(vttText);
  }

  cues = cues.filter(c => !isNaN(c.startTime) && !isNaN(c.endTime));

  if (cues.length === 0 && format !== 'txt') {
    console.log('[vttParser] VTT/SRT parse returned 0 valid cues, trying txt fallback');
    cues = parseTxtTimestamps(vttText);
    cues = cues.filter(c => !isNaN(c.startTime) && !isNaN(c.endTime));
  }

  if (cues.length === 0) {
    console.log('[vttParser] Still 0 valid cues, trying bracketed format fallback');
    cues = parseBracketedFormat(vttText);
  }

  cues.sort((a, b) => a.startTime - b.startTime);
  console.log('[vttParser] Parsed', cues.length, 'subtitle cues');
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
