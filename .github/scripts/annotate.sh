#!/usr/bin/env bash
# Transformă erorile din loguri în adnotări GitHub (vizibile în tab-ul Checks și prin API).
# Folosire: annotate.sh TITLU fisier1.log [fisier2.log ...]
title="$1"; shift
encode() { python3 -c 'import sys; d=sys.stdin.read()[-3500:]; print(d.replace("%","%25").replace("\r","").replace("\n","%0A"), end="")'; }
count=0
for file in "$@"; do
  [ -f "$file" ] || continue
  errors=$(grep -E "\[ERROR\]|ERROR|Exception|Caused by|✗ FAIL|error:|FAILED" "$file" | grep -vE "DEBUG|^\s*at " | head -40)
  if [ -n "$errors" ] && [ $count -lt 9 ]; then
    echo "::error title=${title}: $(basename "$file") (erori)::$(printf '%s' "$errors" | encode)"
    count=$((count+1))
  fi
  if [ $count -lt 9 ]; then
    echo "::error title=${title}: $(basename "$file") (final)::$(tail -n 60 "$file" | encode)"
    count=$((count+1))
  fi
done
