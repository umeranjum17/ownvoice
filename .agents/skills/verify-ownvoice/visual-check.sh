#!/usr/bin/env bash
# visual-check.sh <mocks-dir> <captures-dir>
# Pixel half of the verify-ownvoice Visual guard compare step (SKILL.md step 2):
# for every approved mock cell, the same-named capture must match.
#
# Scoped, not whole-image: the status bar (its clock ticks between runs) and the
# bottom gesture bar are cropped before every check, so a re-render of an
# unchanged screen passes while a stretched/squashed icon still fails — the icon
# lives in the content region and moves thousands of pixels there.
# Checks per cell: geometry, new blank strips (a band of uniform background rows
# the mock does not have; the background reference is read from the mock itself
# so light and dark themes need no hardcoded colours), and content fidelity
# (cropped RMSE plus the changed-pixel fraction, which catches a small-but-strong
# local stretch that RMSE averages away). Any defect class failing is a hard FAIL; clipping/overlap
# verdicts stay with the human side-by-side (open the diff image on FAIL).
# Prints per-cell lines plus "verdict: PASS|FAIL"; exit 0 on PASS, 1 on FAIL.
set -euo pipefail
mocks=${1:?usage: visual-check.sh <mocks-dir> <captures-dir>}
captures=${2:?usage: visual-check.sh <mocks-dir> <captures-dir>}
FIDELITY_LIMIT=${OWNVOICE_VISUAL_FIDELITY_LIMIT:-0.01}  # cropped RMSE; stabilized re-renders sit ~0.0002, a 2x-wide icon ~0.017
CHANGED_LIMIT=${OWNVOICE_VISUAL_CHANGED_LIMIT:-0.0005} # changed-pixel fraction; re-renders ~0.0002, the 2x icon ~0.0013
BAND_MIN=${OWNVOICE_VISUAL_BAND_MIN:-60}                # uniform rows below this height are layout gaps, not strips
BAND_TOL=${OWNVOICE_VISUAL_BAND_TOL:-14}                # per-channel distance from the background reference
TOP_CROP=${OWNVOICE_VISUAL_TOP_CROP:-5}                 # status-bar percent, cropped before every check
BOTTOM_CROP=${OWNVOICE_VISUAL_BOTTOM_CROP:-4}           # gesture-bar percent, cropped before every check

crop() { # $1=in $2=out : drop the system chrome, keep the app content
  local h top bottom
  h=$(magick identify -format '%h' "$1")
  top=$((h * TOP_CROP / 100)); bottom=$((h * BOTTOM_CROP / 100))
  magick "$1" -crop "0x$((h - top - bottom))+0+${top}" +repage "$2"
}

bgref() { # $1=image -> "r g b" whole-image mean: the background dominates, both themes
  magick "$1" -resize '1x1!' -depth 8 txt: | awk 'NR==2{gsub(/[(),]/," "); print $2, $3, $4}'
}

bands() { # $1=image $2=H $3="r g b" -> lines "start-end" of uniform background rows >= BAND_MIN
  magick "$1" -resize "1x${2}!" -depth 8 txt: | awk -v ref="$3" -v tol=$BAND_TOL -v min=$BAND_MIN '
    BEGIN { split(ref, bg, " ") }
    NR>1 { gsub(/[(),]/, " ", $2); split($2, c, " ")
      blank = (c[1]-bg[1]<tol && bg[1]-c[1]<tol && c[2]-bg[2]<tol && bg[2]-c[2]<tol && c[3]-bg[3]<tol && bg[3]-c[3]<tol)
      if (blank) { if (!inrun) { inrun=1; s=NR-2 } }
      else { if (inrun) { if (NR-2-s>=min) print s"-"NR-2; inrun=0 } } }
    END { if (inrun && NR-1-s>=min) print s"-"NR-1 }'
}

fail=0; cells=0
for mock in "$mocks"/*.png; do
  [ -e "$mock" ] || { echo "verdict: FAIL"; echo "reason: no mocks in $mocks"; exit 1; }
  cell=$(basename "$mock"); capture="$captures/$cell"; cells=$((cells + 1))
  [ -f "$capture" ] || { echo "$cell: FAIL (no capture)"; fail=1; continue; }
  mw=$(magick identify -format '%w' "$mock"); mh=$(magick identify -format '%h' "$mock")
  cw=$(magick identify -format '%w' "$capture"); ch=$(magick identify -format '%h' "$capture")
  if [ "$mw" != "$cw" ] || [ "$mh" != "$ch" ]; then
    echo "$cell: FAIL (geometry mock=${mw}x${mh} capture=${cw}x${ch}: off-screen/scale)"
    fail=1; continue
  fi
  work=$(mktemp -d); mshot=$work/m.png; cshot=$work/c.png; diff=$captures/diff-$cell
  crop "$mock" "$mshot"; crop "$capture" "$cshot"
  chh=$(magick identify -format '%h' "$mshot")
  # A capture band is new when no mock band covers >=80% of its rows.
  newbands=$(awk -v min=$BAND_MIN '
    NR==FNR { m[++n]=$0; next }
    { split($0, c, "-"); found=0
      for (i=1; i<=n; i++) { split(m[i], d, "-")
        ov = (c[2]<d[2]?c[2]:d[2]) - (c[1]>d[1]?c[1]:d[1])
        if (ov >= 0.8*(c[2]-c[1])) { found=1; break } }
      if (!found) print }' <(bands "$mshot" "$chh" "$(bgref "$mshot")") <(bands "$cshot" "$chh" "$(bgref "$cshot")"))
  rmse=$(magick compare -metric RMSE "$mshot" "$cshot" "$diff" 2>&1 || true)
  norm=$(echo "$rmse" | grep -o '([0-9.]*)$' | tr -d '()' || echo 1)
  reasons=""
  [ -n "$newbands" ] && reasons="blank-strip rows(es) missing from mock: $(echo "$newbands" | tr '\n' ' ')"
  if awk -v n="$norm" -v lim="$FIDELITY_LIMIT" 'BEGIN{exit !(n>lim)}'; then
    reasons="$reasons fidelity RMSE $norm over $FIDELITY_LIMIT (stretch/squash, clipping, overlap or off-screen vs mock)"
  fi
  # A small-but-strong local change (the stretched icon moves ~0.1-0.2% of pixels
  # while global shimmer stays ~0.02%): changed-pixel fraction catches what RMSE averages away.
  changed=$(magick compare -metric AE "$mshot" "$cshot" null: 2>&1 | grep -o '([0-9.e-]*)$' | tr -d '()' || echo 1)
  if awk -v n="$changed" -v lim="$CHANGED_LIMIT" 'BEGIN{exit !(n>lim)}'; then
    reasons="$reasons changed-pixel fraction $changed over $CHANGED_LIMIT (local stretch/squash, clipping or overlap vs mock)"
  fi
  if [ -n "$reasons" ]; then echo "$cell: FAIL ($reasons)"; fail=1
  else echo "$cell: PASS (RMSE $norm)"; rm -f "$diff"; fi
  rm -rf "$work"
done
[ "$cells" -gt 0 ] || { echo "verdict: FAIL"; echo "reason: no mocks in $mocks"; exit 1; }
[ $fail -eq 0 ] && echo "verdict: PASS ($cells cells)" || { echo "verdict: FAIL"; exit 1; }
