# OpenCode Frontend Fixes — ytTranscript

## Context

Project: ytTranscript at /Users/radek/yt-transcript/client/
React + Vite frontend. Two small fixes needed.

## What to do (in order)

### 1. Fix SRT timestamps in `client/src/api.js`

Line 21 currently reads:

```js
const end = formatSRTTime(snippets[i].start + snippets[i].duration);
```

Replace with:

```js
const endTime =
  i + 1 < snippets.length ? snippets[i + 1].start : snippets[i].start + snippets[i].duration;
const end = formatSRTTime(endTime);
```

This prevents overlapping timestamps by using the next segment's start time instead of start+duration.

### 2. Deduplicate CSS in `client/src/styles/main.css`

Remove duplicate CSS definitions. The following classes are defined TWICE (once early in the file, once late):

| Class           | First definition                          | Second definition                                     |
| --------------- | ----------------------------------------- | ----------------------------------------------------- |
| `.reset-button` | line ~473 (in the "Reset Button" section) | line ~649 (in the "Reset Button (updated)" section)   |
| `.export-bar`   | line ~271 (in the "Export Bar" section)   | line ~678 (in the "Export Buttons (updated)" section) |
| `.empty-state`  | line ~407 (in the "Empty State" section)  | line ~719 (in the "Empty State (updated)" section)    |
| `.video-info`   | line ~230 (in the "Video Info" section)   | line ~730 (in the "Video Info (updated)" section)     |

Keep the SECOND definition for each (lines 649+, 678+, 719+, 730+) — these are slightly refined (padding adjustments, etc.). DELETE the FIRST definition block for each (lines 473-500, 271-311, 407-417, 230-260).

Also remove the "(updated)" comment suffixes from the remaining definitions.

### 3. Verify build

```bash
cd /Users/radek/yt-transcript/client
npm run build
```

Build must produce `dist/` without errors.

## Rules

- Use surgical changes — `patch` where possible
- Do NOT touch files in the parent directory (server.js, manage.sh, etc.)
- Do NOT delete any files
- After implementing, run `cd /Users/radek/yt-transcript/client && npm run build`
- Run `cd /Users/radek/yt-transcript && git diff --stat`
- Report back: which files changed, lines added/removed, any errors
