#!/bin/sh
# Tiles review stills into one contact sheet: scripts/sheet.sh <dir> <columns> <width>
dir="$1"; cols="${2:-3}"; width="${3:-640}"
ffmpeg -y -loglevel error -pattern_type glob -i "$dir/*.png" \
  -vf "scale=$width:-1,tile=${cols}x$(( ($(ls "$dir"/*.png | wc -l) + cols - 1) / cols )):padding=8:color=white" \
  -frames:v 1 "$dir/../$(basename "$dir")-sheet.png"
