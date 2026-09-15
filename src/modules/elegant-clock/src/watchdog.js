const { performance } = require('perf_hooks');
const {
  RENDERER_STALE_AFTER_MS,
  WATCHDOG_CHECK_INTERVAL_MS,
  createWatchdogMonitor
} = require('./watchdog-monitor');

const parentPort = process.parentPort;

if (!parentPort) {
  process.exit(1);
}

const monitor = createWatchdogMonitor({
  now: () => performance.now(),
  onStall: ({ staleForMs }) => {
    parentPort.postMessage({
      type: 'renderer-stalled',
      staleForMs
    });
  }
});

let lastCheckAt = performance.now();
const checkTimer = setInterval(() => {
  const currentTime = performance.now();
  const schedulerDelayMs = currentTime - lastCheckAt;
  lastCheckAt = currentTime;

  if (schedulerDelayMs >= WATCHDOG_CHECK_INTERVAL_MS + RENDERER_STALE_AFTER_MS) {
    monitor.grantGracePeriod();
    return;
  }

  monitor.check();
}, WATCHDOG_CHECK_INTERVAL_MS);

parentPort.on('message', (event) => {
  const message = event?.data;

  if (message?.type === 'renderer-heartbeat') {
    monitor.heartbeat();
    return;
  }

  if (message?.type === 'renderer-monitoring') {
    if (message.enabled) {
      monitor.resume();
    } else {
      monitor.pause();
    }
    return;
  }

  if (message?.type === 'shutdown') {
    clearInterval(checkTimer);
    process.exit(0);
  }
});

parentPort.postMessage({ type: 'watchdog-ready' });
