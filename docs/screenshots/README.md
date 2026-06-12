# Screenshots

This directory is intentionally empty.

Screenshots are not included in this repository because:

1. **No live oMLX** at the time of the portfolio-closure audit
   (2026-06-12). Capturing the real "Reconstruct with AI" flow
   requires a loaded model.
2. **Privacy**: transcripts and summaries are user-provided content.
   A screenshot with a real video URL would leak someone else's
   content into the public portfolio.
3. **Maintenance**: screenshots go stale on every UI tweak.

## How to add screenshots

When ready, regenerate before any portfolio publication:

```bash
# 1. Make sure oMLX is running with a model loaded
curl -sS "http://127.0.0.1:8585/v1/models" | head

# 2. Start the app
cd /Users/radek/Documents/Projects/yt-transcript
./manage.sh start

# 3. Open http://localhost:4000 in a real browser.
#    Use a video you own (or a CC0 / Creative Commons one)
#    such as a Big Buck Bunny clip.

# 4. Capture: empty state, transcript loaded, reconstruction done,
#    summary done, mobile breakpoint (≤ 640px), export menu open.

# 5. Save PNGs here as:
#    - 01-empty.png
#    - 02-transcript.png
#    - 03-reconstruct.png
#    - 04-summary.png
#    - 05-mobile.png
#    - 06-export.png
```

## Suggested tool

- macOS: `Cmd+Shift+4` → select area, or `screencapture -i -o file.png`
- Or run the app in Safari, then `screencapture -l <window-id> file.png`
