const WATCHDOG_CHECK_INTERVAL_MS = 15_000;
const RENDERER_STALE_AFTER_MS = 45_000;
const RECOVERY_COOLDOWN_MS = 120_000;

function createWatchdogMonitor({
  now = Date.now,
  staleAfterMs = RENDERER_STALE_AFTER_MS,
  recoveryCooldownMs = RECOVERY_COOLDOWN_MS,
  onStall = () => {}
} = {}) {
  let lastHeartbeatAt = null;
  let lastRecoveryAt = null;

  function heartbeat() {
    lastHeartbeatAt = now();
  }

  function pause() {
    lastHeartbeatAt = null;
  }

  function resume() {
    lastHeartbeatAt = now();
  }

  function grantGracePeriod() {
    if (lastHeartbeatAt !== null) {
      lastHeartbeatAt = now();
    }
  }

  function check() {
    if (lastHeartbeatAt === null) {
      return false;
    }

    const currentTime = now();
    if (currentTime < lastHeartbeatAt) {
      lastHeartbeatAt = currentTime;
      return false;
    }

    const staleForMs = currentTime - lastHeartbeatAt;
    if (staleForMs < staleAfterMs) {
      return false;
    }

    if (lastRecoveryAt !== null && currentTime - lastRecoveryAt < recoveryCooldownMs) {
      return false;
    }

    lastRecoveryAt = currentTime;
    onStall({ staleForMs });
    return true;
  }

  return {
    check,
    grantGracePeriod,
    heartbeat,
    pause,
    resume
  };
}

module.exports = {
  RECOVERY_COOLDOWN_MS,
  RENDERER_STALE_AFTER_MS,
  WATCHDOG_CHECK_INTERVAL_MS,
  createWatchdogMonitor
};
