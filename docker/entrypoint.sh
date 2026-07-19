#!/usr/bin/env bash
#
# Minimal process supervisor: runs the API server and the Razorpay
# settlement poll loop as sibling processes in one container, forwards
# SIGTERM/SIGINT to both, and reaps them independently.
#
# Chosen deliberately for this stage over a separate poller
# service/deployment (see DEPLOYMENT.md): it is the "same container via
# a process supervisor" option the packaging session scoped in, not a
# recommendation to stay this way forever. Trade-off, stated plainly:
# the poll loop's liveness is coupled to the API server container's
# liveness (the API server exiting always brings the poller down too),
# and horizontally scaling the API to N replicas multiplies the poll
# loop to N pollers too. RazorpaySettlementProcessor.runOnce() is
# idempotent by design (see that class's own comment), so N concurrent
# pollers draining the same durable event store is safe, just wasteful.
# A production-grade shape would run the poller as its own service
# scaled to exactly 1 replica; that is future infrastructure work,
# intentionally not added in this session.
#
# The API server and the poller are NOT symmetric here, deliberately:
# the poller legitimately exits 0 and stays exited when Razorpay
# credentials are not configured for this deployment (see
# createRazorpaySettlementProcessor.ts's own "optional, absent" design —
# the same shape the Razorpay connector itself already uses). Killing
# the whole container -- and a healthy, currently-serving API server --
# because of that supported no-op would make every Razorpay-less
# deployment unusable. So: the API server is the primary process (its
# exit, any reason, brings the container down); the poller is reaped
# independently and its exit, clean or crashed, never kills the API
# server by itself. A crashed (nonzero-exit) poller is surfaced loudly
# as a warning -- settlement confirmations stop processing until this
# container is redeployed -- which is as far as this minimal supervisor
# goes without adding real per-process restart supervision (out of
# scope this session).
#
# All waiting happens directly in this top-level shell, never inside a
# `( ... ) &` subshell: forking a subshell to monitor a PID does NOT
# make that subshell the process's parent (the top-level shell that
# originally backgrounded it stays the real parent), so `wait PID`
# inside such a subshell always fails with "pid PID is not a child of
# this shell". Learned the hard way -- an earlier version of this
# script backgrounded the poller-monitoring logic in a subshell and the
# wait silently no-op'd, immediately reporting exit code 127 on every
# boot.

set -euo pipefail

node packages/api/dist/server.js &
API_PID=$!

tsx scripts/process-razorpay-settlements.ts &
POLLER_PID=$!

echo "[entrypoint] started API (pid $API_PID) and settlement poller (pid $POLLER_PID)"

shutdown() {
  echo "[entrypoint] shutting down: forwarding TERM to API (pid $API_PID) and poller (pid $POLLER_PID)"
  kill -TERM "$API_PID" 2>/dev/null || true
  kill -TERM "$POLLER_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
  wait "$POLLER_PID" 2>/dev/null || true
}

trap 'shutdown; exit 0' TERM INT

poller_done=0

while true; do
  set +e
  if [ "$poller_done" -eq 1 ]; then
    wait -n "$API_PID"
  else
    wait -n "$API_PID" "$POLLER_PID"
  fi
  set -e

  if ! kill -0 "$API_PID" 2>/dev/null; then
    API_EXIT=0
    wait "$API_PID" || API_EXIT=$?
    echo "[entrypoint] API server exited with code $API_EXIT"
    shutdown
    exit "$API_EXIT"
  fi

  if [ "$poller_done" -eq 0 ] && ! kill -0 "$POLLER_PID" 2>/dev/null; then
    poller_done=1
    POLLER_EXIT=0
    wait "$POLLER_PID" || POLLER_EXIT=$?
    if [ "$POLLER_EXIT" -eq 0 ]; then
      echo "[entrypoint] settlement poller exited cleanly (code 0) -- likely Razorpay not configured for this deployment; API server continues unaffected"
    else
      echo "[entrypoint] WARNING: settlement poller exited with code $POLLER_EXIT; API server continues unaffected, but settlement confirmations will stop processing until this container is redeployed" >&2
    fi
  fi
done
