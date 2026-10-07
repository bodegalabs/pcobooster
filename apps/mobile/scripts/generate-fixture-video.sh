#!/usr/bin/env bash
# Writes src/harness/fixture-video.json: a three-second synthetic test pattern with a 440 Hz tone
# (160 by 90 H.264 and AAC, about 16 KB), the "Rehearsal video" fixture the system player plays
# in fixture launches. Needs ffmpeg with libx264. The audio fixture is generated in code
# (`fixture-media.ts`).
set -euo pipefail
cd "$(dirname "$0")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "testsrc=size=160x90:rate=12" \
  -f lavfi -i "sine=frequency=440:sample_rate=22050" \
  -t 3 -c:v libx264 -preset veryslow -crf 36 -pix_fmt yuv420p -profile:v baseline \
  -c:a aac -b:a 24k -ac 1 -movflags +faststart -map_metadata -1 -fflags +bitexact \
  "$work/rehearsal.mp4"
printf '{"mp4":"%s"}\n' "$(base64 < "$work/rehearsal.mp4" | tr -d '\n')" > src/harness/fixture-video.json
