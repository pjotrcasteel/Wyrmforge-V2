#!/usr/bin/env bash
set -euo pipefail

# The player-facing routes are stable. Versioned SHA routes are CI-only.
sha="${GITHUB_SHA:?GitHub Actions must supply a deployment SHA}"
site="https://pjotrcasteel.github.io/Wyrmforge-V2"
iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
android='Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'

fetch() {
  curl --fail --silent --show-error --location --retry 5 --retry-delay 2 \
    --retry-all-errors --max-time 25 "$1"
}

verify() {
  local code
  # The public root and canonical Hunt must both serve real HTML;
  # testing only the new SHA directory was insufficient.
  fetch "$site/" > /tmp/wyrmforge-root.html
  grep -Fq 'Wyrmforge V2' /tmp/wyrmforge-root.html

  curl --fail --silent --show-error --location --retry 5 --retry-delay 2 \
    --retry-all-errors --max-time 25 -A "$iphone" \
    "$site/play-hunt.html?releaseCheck=${sha:0:7}" > /tmp/wyrmforge-iphone.html
  curl --fail --silent --show-error --location --retry 5 --retry-delay 2 \
    --retry-all-errors --max-time 25 -A "$android" \
    "$site/play-hunt.html?releaseCheck=${sha:0:7}" > /tmp/wyrmforge-android.html
  grep -Fq 'Wyrmforge' /tmp/wyrmforge-iphone.html
  grep -Fq 'Wyrmforge' /tmp/wyrmforge-android.html
  grep -Fq 'src="./external-terrain-lab.mjs"' /tmp/wyrmforge-iphone.html

  fetch "$site/external-terrain-lab.mjs" > /tmp/wyrmforge-host.mjs
  fetch "$site/src/build-info.mjs?v=${sha:0:7}" > /tmp/wyrmforge-build-info.mjs
  grep -Fq 'src/build-info.mjs' /tmp/wyrmforge-host.mjs
  grep -Fq "COMMIT = \"$sha\";" /tmp/wyrmforge-build-info.mjs

  # Still verify the exact deployment, but NEVER advertise it as permanent.
  fetch "$site/builds/$sha/play-hunt.html" > /tmp/wyrmforge-build-hunt.html
  fetch "$site/builds/$sha/src/build-info.mjs" > /tmp/wyrmforge-build-module.mjs
  grep -Fq "Build ${sha:0:7} · initializing" /tmp/wyrmforge-build-hunt.html
  grep -Fq "COMMIT = \"$sha\";" /tmp/wyrmforge-build-module.mjs

  # A retired SHA path MUST offer a self-healing HTML entry; a missing JS
  # file must NOT be redirected to the game.
  code=$(curl --silent --show-error --location --max-time 25 \
    -o /tmp/wyrmforge-retired.html -w '%{http_code}' \
    "$site/builds/0000000000000000000000000000000000000000/play-hunt.html")
  test "$code" = "404"
  grep -Fq 'Wyrmforge V2 — Game link moved' /tmp/wyrmforge-retired.html
  grep -Fq 'window.location.replace(target.href)' /tmp/wyrmforge-retired.html
  echo "Verified canonical Hunt, mobile HTTP responses, exact build and legacy fallback for ${sha:0:7}"
}

verify
# Detect short-lived CDN/cache propagation regressions that the immediate
# post-deploy probe used to miss (not a substitute for a real iPhone test).
sleep 30
verify
echo "VERIFIED STABLE PLAY HUNT: $site/play-hunt.html"
