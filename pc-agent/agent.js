const si = require("systeminformation");
const config = require("./config");

const secret = process.env.PC_METRICS_SECRET || config.PC_METRICS_SECRET;

/** 60s unless config overrides. M5 will let the server drive this. */
const DEFAULT_POLL_INTERVAL_MS = 60000;
const pollIntervalMs =
  Number(config.POLL_INTERVAL_MS) > 0
    ? Number(config.POLL_INTERVAL_MS)
    : DEFAULT_POLL_INTERVAL_MS;

/**
 * Picks the GPU that actually reports load.
 *
 * controllers[0] was wrong: on a board with integrated graphics the iGPU
 * usually sorts first and reports utilizationGpu === null, so every GPU field
 * went to the database as null while a perfectly good discrete card sat at
 * index 1. Prefer an NVIDIA controller reporting utilisation, else any
 * controller reporting utilisation, else nothing.
 */
function pickGpu(controllers) {
  const list = Array.isArray(controllers) ? controllers : [];
  const reporting = list.filter((c) => c && c.utilizationGpu != null);
  const nvidia = reporting.find((c) =>
    /nvidia/i.test(`${c.vendor || ""} ${c.model || ""}`),
  );
  return nvidia || reporting[0] || null;
}

/** One-line inventory of what was on the bus, for the warning and for `raw`. */
function summariseControllers(controllers) {
  return (Array.isArray(controllers) ? controllers : []).map((c) => ({
    vendor: c.vendor || null,
    model: c.model || null,
    utilizationGpu: c.utilizationGpu != null ? c.utilizationGpu : null,
    temperatureGpu: c.temperatureGpu != null ? c.temperatureGpu : null,
    memoryTotal: c.memoryTotal != null ? c.memoryTotal : null,
  }));
}

async function collectAndSend() {
  try {
    const [cpu, cpuTemp, cpuSpeed, graphics, mem, net, time, disks] =
      await Promise.all([
        si.currentLoad(),
        si.cpuTemperature(),
        si.cpuCurrentSpeed(),
        si.graphics(),
        si.mem(),
        si.networkStats(),
        si.time(),
        si.fsSize(),
      ]);

    const controllers = summariseControllers(graphics.controllers);
    const gpu = pickGpu(graphics.controllers);

    if (!gpu) {
      // Never send nulls without saying why — this is the line that would have
      // caught the controllers[0] bug months ago.
      console.warn(
        `⚠ No GPU reporting utilisation; sending null GPU fields. Controllers seen: ${
          controllers.length
            ? JSON.stringify(controllers)
            : "(none returned by systeminformation)"
        }`,
      );
    }

    const activeNet =
      net.find((n) => n.tx_sec > 0 || n.rx_sec > 0) || net[0] || {};

    const drives = (disks || [])
      .filter((d) => d.size > 1073741824)
      .map((d) => ({
        letter: d.mount,
        size_gb: +(d.size / 1073741824).toFixed(2),
        used_gb: +(d.used / 1073741824).toFixed(2),
        percent: +d.use.toFixed(1),
        type: d.type || undefined,
      }));

    const payload = {
      cpu_usage: cpu.currentLoad != null ? +cpu.currentLoad.toFixed(1) : null,
      cpu_temp: cpuTemp.main != null ? +cpuTemp.main.toFixed(1) : null,
      cpu_clock_mhz:
        cpuSpeed.avg != null ? +(cpuSpeed.avg * 1000).toFixed(0) : null,
      gpu_usage: gpu && gpu.utilizationGpu != null ? +gpu.utilizationGpu : null,
      gpu_temp: gpu && gpu.temperatureGpu != null ? +gpu.temperatureGpu : null,
      gpu_vram_used_mb: gpu && gpu.memoryUsed != null ? +gpu.memoryUsed : null,
      gpu_vram_total_mb: gpu && gpu.memoryTotal != null ? +gpu.memoryTotal : null,
      ram_used_gb: +(mem.active / 1073741824).toFixed(2),
      ram_total_gb: +(mem.total / 1073741824).toFixed(2),
      network_upload_mbps:
        activeNet.tx_sec != null
          ? +(activeNet.tx_sec / 125000).toFixed(3)
          : null,
      network_download_mbps:
        activeNet.rx_sec != null
          ? +(activeNet.rx_sec / 125000).toFixed(3)
          : null,
      uptime_seconds: time.uptime != null ? Math.floor(time.uptime) : null,
      drives,
      // Diagnostics only. This used to be the entire systeminformation dump
      // every cycle — tens of KB of jsonb per row, written 2,880 times a day,
      // none of it ever read.
      raw: {
        gpu_controllers: controllers,
        gpu_selected:
          gpu && (gpu.model || gpu.vendor)
            ? `${gpu.vendor || ""} ${gpu.model || ""}`.trim()
            : null,
        cpu_temp: {
          main: cpuTemp.main != null ? cpuTemp.main : null,
          max: cpuTemp.max != null ? cpuTemp.max : null,
          socket: cpuTemp.socket != null ? cpuTemp.socket : null,
        },
        iface: activeNet.iface || null,
      },
    };

    const res = await fetch(config.MYCELIUM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`✓ Metrics sent [${new Date().toISOString()}]`);
    } else {
      const text = await res.text();
      console.error(`✗ Failed to send metrics: ${res.status} ${text}`);
    }
  } catch (err) {
    console.error(`✗ Failed to send metrics: ${err.message}`);
  }
}

console.log(`Mycelium PC Agent started (interval ${pollIntervalMs / 1000}s)`);
collectAndSend();
setInterval(collectAndSend, pollIntervalMs);
