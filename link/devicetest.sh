#!/bin/sh
# Runs ComputerFlowTest on the phone adb sees, against the real helper running the fake claude from
# testdata/bin under a throwaway HOME, reached through adb reverse. Install the debug app and its test
# package first (see README). Leaves nothing behind: the helper stops, the pairing and its key are deleted.
# LISTEN=host:port instead reaches the helper over the network, such as this computer's home-network or
# tailnet address, to check the phone can reach it there.
set -eu
cd "$(dirname "$0")"
work=$(mktemp -d)
pid=
cleanup() { [ -z "$pid" ] || kill "$pid" 2>/dev/null || true; adb reverse --remove tcp:7441 2>/dev/null || true; rm -rf "$work"; }
trap cleanup EXIT
go build -o "$work/ownvoice-link" .
export HOME="$work/home" PATH="$PWD/testdata/bin:$PATH"
unset XDG_CONFIG_HOME
mkdir -p "$HOME"
listen=${LISTEN:-127.0.0.1:7441}
[ -n "${LISTEN:-}" ] || adb reverse tcp:7441 tcp:7441 >/dev/null

# Runs one step: the given number of tests must pass (the others skip) and none may fail.
run() {
  want=$1; shift
  out=$(adb shell am instrument -w -r -e class dev.ownvoice.app.ComputerFlowTest "$@" dev.ownvoice.app.test/androidx.test.runner.AndroidJUnitRunner)
  passed=$(echo "$out" | grep -c '^INSTRUMENTATION_STATUS_CODE: 0' || true)
  failed=$(echo "$out" | grep -c '^INSTRUMENTATION_STATUS_CODE: -2' || true)
  echo "passed $passed of $want, failed $failed"
  [ "$passed" = "$want" ] && [ "$failed" = 0 ] || { echo "$out"; exit 1; }
}

echo "== pair"
mkfifo "$work/answer"
"$work/ownvoice-link" pair --listen "$listen" --show-text < "$work/answer" > "$work/pair.out" &
pid=$!
exec 3> "$work/answer"
for _ in $(seq 50); do grep -q '"v":1}$' "$work/pair.out" && break; sleep 0.1; done
code=$(grep '"v":1}$' "$work/pair.out" | base64 -w0)
[ -n "$code" ] || { cat "$work/pair.out"; exit 1; }
echo y >&3
run 1 -e step pair -e pairing "$code"
wait "$pid" || { cat "$work/pair.out"; exit 1; }; pid=
exec 3>&-
grep -q 'Paired "' "$work/pair.out" || { cat "$work/pair.out"; exit 1; }

echo "== computer on"
"$work/ownvoice-link" --listen "$listen" > "$work/serve.out" 2>&1 &
pid=$!
sleep 1
run 2 -e step on
kill "$pid"; wait "$pid" 2>/dev/null || true; pid=
echo "helper log:"; cat "$work/serve.out"

echo "== computer off"
run 1 -e step off

echo "== forget"
run 1 -e step forget
