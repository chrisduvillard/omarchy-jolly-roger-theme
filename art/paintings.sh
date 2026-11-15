#!/bin/bash
# Builds the public-domain painting wallpapers listed in paintings.tsv.
#
#   art/paintings.sh [--fetch] [name ...]
#
# Sources are read from art/src/<name>.<ext>; --fetch downloads any that are
# missing from Wikimedia Commons (slowly: Commons rate-limits anonymous clients).
# Each one is cropped to 16:9 around the point given in the table, resized to at
# most 3840x2160 and written to backgrounds/<file>.webp. Nothing is repainted;
# the optional "grade" column only holds small tonal corrections for museum
# photographs that came out washed out.
set -euo pipefail

ART=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC="${PAINTINGS_SRC:-$ART/src}"
OUT="$ART/../backgrounds"
TSV="$ART/paintings.tsv"
UA="omarchy-theme-builder/1.0 (wallpaper build script)"
QUALITY="${QUALITY:-84}"

fetch=0
wanted=()
for arg in "$@"; do
  if [[ $arg == --fetch ]]; then fetch=1; else wanted+=("$arg"); fi
done

mkdir -p "$SRC" "$OUT"

# file  name  cx  cy  zoom  trim(l,t,r,b %)  grade  width  commons-file  title  artist  year  collection
while IFS=$'\t' read -r file name cx cy zoom trim grade width commons _rest; do
  [[ -z $file || $file == \#* || $file == file ]] && continue
  if (( ${#wanted[@]} )) && [[ ! " ${wanted[*]} " == *" $name "* ]]; then continue; fi

  src=$(find "$SRC" -maxdepth 1 -name "$name.*" ! -name '*.part' | head -1)
  if [[ -z $src && $fetch == 1 ]]; then
    ext="${commons##*.}"; ext="${ext,,}"; [[ $ext == jpeg ]] && ext=jpg
    enc=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1].replace(" ","_")))' "$commons")
    url="https://commons.wikimedia.org/wiki/Special:FilePath/$enc"
    [[ $width != 0 ]] && url="$url?width=$width"
    echo "fetching $name"
    curl -sS -L --fail --retry 4 --retry-delay 30 -A "$UA" -o "$SRC/$name.$ext" "$url"
    src="$SRC/$name.$ext"
    sleep 5
  fi
  if [[ -z $src ]]; then echo "skip $name: no source (run with --fetch)" >&2; continue; fi

  read -r w h < <(magick identify -format '%w %h\n' "${src}[0]")
  IFS=, read -r tl tt tr tb <<<"${trim:-0,0,0,0}"
  # Trim frame/margins, then take the largest 16:9 window (scaled by zoom) centred on cx,cy.
  geom=$(awk -v w="$w" -v h="$h" -v cx="$cx" -v cy="$cy" -v z="$zoom" -v tl="$tl" -v tt="$tt" -v tr="$tr" -v tb="$tb" 'BEGIN {
    x0 = w * tl / 100; y0 = h * tt / 100; iw = w * (1 - (tl + tr) / 100); ih = h * (1 - (tt + tb) / 100)
    cw = iw; if (ih * 16 / 9 < cw) cw = ih * 16 / 9
    cw = cw * z; ch = cw * 9 / 16
    x = x0 + cx * iw - cw / 2; y = y0 + cy * ih - ch / 2
    if (x < x0) x = x0; if (y < y0) y = y0
    if (x + cw > x0 + iw) x = x0 + iw - cw; if (y + ch > y0 + ih) y = y0 + ih - ch
    printf "%dx%d+%d+%d %d", cw, ch, x, y, cw
  }')
  crop=${geom% *}; cw=${geom#* }
  # Never enlarge beyond the source, except to reach a 2560px floor.
  if (( cw >= 3840 )); then size=3840x2160; elif (( cw >= 2560 )); then size=$(( cw / 2 * 2 ))x$(( cw * 9 / 16 / 2 * 2 )); else size=2560x1440; fi

  # shellcheck disable=SC2086
  magick "${src}[0]" -auto-orient -crop "$crop" +repage -colorspace sRGB -filter Lanczos -resize "${size}!" \
    $( [[ $grade == - ]] || echo "${grade//_/ }" ) -strip -define webp:method=6 -define webp:use-sharp-yuv=true -quality "$QUALITY" "$OUT/$file.webp"
  printf '%-28s %-10s %s\n' "$file.webp" "$size" "$(du -h "$OUT/$file.webp" | cut -f1)"
done <"$TSV"
