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
  const lines = clean.split('\n');

  const timestampPattern = /^\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    const match = line.match(timestampPattern);
    if (match) {
      const startTime = parseTimestamp(match[1]);
      const endTime = parseTimestamp(match[2]);
      let cueText = (match[3] || '').trim();

      if (cueText.length === 0 && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.length > 0 && !nextLine.match(timestampPattern)) {
          cueText = nextLine;
          i++;
        }
      }

      if (cueText.length > 0) {
        cues.push({ startTime, endTime, text: cueText });
      }
    }
  }

  console.log('[vttParser] parseBracketedFormat found', cues.length, 'cues');
  return cues;
}

export function parseVTT(vttText: string): SubtitleCue[] {
  console.log('[vttParser] V3 parseVTT called, text length:', vttText.length);
  
  let cues: SubtitleCue[];
  
  // Always try bracketed format first for any text containing [ and -->
  const trimmed = vttText.trim();
  if (trimmed.includes('[') && trimmed.includes('-->')) {
    cues = parseBracketedFormat(vttText);
    if (cues.length > 0) {
      console.log('[vttParser] parseBracketedFormat matched:', cues.length, 'cues');
      cues.sort((a, b) => a.startTime - b.startTime);
      return cues;
    }
  }
  
  // Then try standard VTT/SRT
  if (trimmed.startsWith('WEBVTT') || /^\d+\s*\n\d{2}:\d{2}/.test(trimmed)) {
    cues = parseVTTOrSRT(vttText);
    cues = cues.filter(c => !isNaN(c.startTime) && !isNaN(c.endTime));
    if (cues.length > 0) {
      cues.sort((a, b) => a.startTime - b.startTime);
      return cues;
    }
  }
  
  // Then try txt timestamps
  cues = parseTxtTimestamps(vttText);
  cues = cues.filter(c => !isNaN(c.startTime) && !isNaN(c.endTime));
  if (cues.length > 0) {
    cues.sort((a, b) => a.startTime - b.startTime);
    return cues;
  }
  
  // Final fallback: try all parsers
  cues = parseVTTOrSRT(vttText);
  if (cues.length === 0) cues = parseBracketedFormat(vttText);
  
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
