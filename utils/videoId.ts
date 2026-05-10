/**
 * Extracts a numeric Vimeo video ID from a raw input that may be either an ID
 * or a full Vimeo URL (vimeo.com/12345, player.vimeo.com/video/12345, etc.).
 */
export function extractVimeoId(input: string | null | undefined): string {
  if (!input) return '';
  const trimmed = String(input).trim();
  if (!trimmed) return '';
  if (/^\d+$/.test(trimmed)) return trimmed;
  const playerMatch = trimmed.match(/player\.vimeo\.com\/video\/(\d+)/);
  if (playerMatch) return playerMatch[1];
  const match = trimmed.match(/vimeo\.com\/(?:.*\/)?(\d+)/);
  if (match) return match[1];
  return trimmed;
}

/**
 * Extracts an 11-character YouTube video ID from a raw input that may be either
 * an ID or a full YouTube URL (youtube.com/watch?v=, youtu.be/, embed/).
 */
export function extractYouTubeId(input: string | null | undefined): string {
  if (!input) return '';
  const trimmed = String(input).trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  if (match) return match[1];
  return trimmed;
}
