#!/bin/bash
# Rebuilds every generated file in the theme from the sources in art/.
#
#   art/build.sh            # originals, logo and previews
#   art/build.sh --fetch    # also re-download and rebuild the paintings
#   art/build.sh --intro    # also re-render the animated intro (slow; needs ffmpeg)
#
# Needs: node (with `npm install` run once in art/), Chromium, ImageMagick.
set -euo pipefail
ART=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(dirname "$ART")
cd "$ART"

# Original, procedurally painted wallpapers: scene -> backgrounds/<file>.webp
ORIGINALS=(
  "black-sails:01-black-sails"
  "jolly-roger:03-jolly-roger"
  "dead-reckoning:05-dead-reckoning"
  "the-deep:07-the-deep"
  "ghost-ship:10-ghost-ship"
  "safe-harbour:12-safe-harbour"
  "signal-flags:14-signal-flags"
  "treasure-map:16-treasure-map"
)
for pair in "${ORIGINALS[@]}"; do
  node render.mjs "${pair%%:*}" --out "$ROOT/backgrounds/${pair##*:}.webp" --quality 0.9
done

# Public-domain paintings and charts
if [[ " $* " == *" --fetch "* ]]; then ./paintings.sh --fetch; fi

# The default wallpaper's intro: 6 s at 2560x1440, ending on the still itself.
# Omarchy plays backgrounds/intros/<name>.mp4 when switching to the theme.
if [[ " $* " == *" --intro "* ]]; then
  frames=$(mktemp -d)
  node render.mjs black-sails --scale 0.6667 --frames 180 --quality 0.96 --out "$frames"
  mkdir -p "$ROOT/backgrounds/intros"
  ffmpeg -v error -y -framerate 30 -i "$frames/f%04d.jpg" -c:v libx264 -profile:v high -pix_fmt yuv420p \
    -crf 21 -preset slow -movflags +faststart -an "$ROOT/backgrounds/intros/01-black-sails.mp4"
  rm -rf "$frames"
fi

# Boot / unlock logo, and the picture of it Omarchy shows under Style > Unlock.
# The compositing mirrors `omarchy plymouth preview`, minus opening a viewer.
node render.mjs unlock --out "$ROOT/unlock.png"
bg=$(sed -n 's/^background *= *"\(#[0-9a-fA-F]*\)".*/\1/p' "$ROOT/colors.toml")
text=$(sed -n 's/^foreground *= *"\(#[0-9a-fA-F]*\)".*/\1/p' "$ROOT/colors.toml")
plymouth="${OMARCHY_PATH:-/usr/share/omarchy}/default/plymouth"
if [[ -d $plymouth ]]; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  for a in bullet entry lock; do magick "$plymouth/$a.png" -channel RGB +level-colors "$text","$text" "$tmp/$a.png"; done
  read -r lw lh < <(magick identify -format '%w %h\n' "$ROOT/unlock.png")
  read -r ew eh < <(magick identify -format '%w %h\n' "$tmp/entry.png")
  kh=$(( eh * 8 / 10 )); kw=$(( 84 * kh / 96 ))
  lx=$(( (1920 - lw) / 2 )); ly=$(( (1080 - lh) / 2 )); ex=$(( (1920 - ew) / 2 )); ey=$(( ly + lh + 40 ))
  bullets=()
  for i in 0 1 2 3; do bullets+=( '(' "$tmp/bullet.png" -resize 7x7 ')' -geometry "+$(( ex + 20 + i * 12 ))+$(( ey + eh / 2 - 4 ))" -composite ); done
  magick -size 1920x1080 "xc:$bg" "$ROOT/unlock.png" -geometry "+$lx+$ly" -composite \
    "$tmp/entry.png" -geometry "+$ex+$ey" -composite \
    '(' "$tmp/lock.png" -resize "${kw}x${kh}" ')' -geometry "+$(( ex - kw - 15 ))+$(( ey + eh / 2 - kh / 2 ))" -composite \
    "${bullets[@]}" -depth 8 -strip "$ROOT/preview-unlock.png"
fi

# Theme-picker preview and the README gallery
node shot.mjs preview.html "$ROOT/preview.png" 2560 1440
node shot.mjs palette.html "$ART/palette.png" 1600 400
magick montage "$ROOT"/backgrounds/*.webp -thumbnail 480x270^ -gravity center -extent 480x270 \
  -background '#0b1219' -tile 4x -geometry +6+6 -quality 82 "$ART/gallery.jpg"
echo "done"
