# Move audio instruction & transcript to mirror mode only

## Changes

**Remove from normal view:**
- [x] The audio instruction player (play/stop button + transcript) will no longer appear on the normal video page scroll view

**Add to mirror mode (split & full mirror):**
- [x] Two small icon buttons will appear at the bottom of the mirror area, next to the record button:
  - [x] Audio instruction button — plays/stops the audio instruction
  - [x] Transcript button — toggles the transcript overlay on/off
- [x] Both buttons only show when not recording

**Transcript overlay:**
- [x] When the transcript button is tapped, a semi-transparent overlay slides down from the top of the mirror view
- [x] Shows the instruction text in a scrollable area over the camera feed
- [x] Tap the transcript button again (or an X) to dismiss it
- [x] The overlay has a dark translucent background so text is readable over the camera

**Existing narrative audio (YouTube-based) stays as-is** — it already only appears in mirror mode
