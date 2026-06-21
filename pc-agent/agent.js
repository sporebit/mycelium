const si = require("systeminformation");
const config = require("./config");

const secret = process.env.PC_METRICS_SECRET || config.PC_METRICS_SECRET;

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

    const gpu = graphics.controllers?.[0] ?? {};

    const activeNet =
      net.find((n) => n.tx_sec > 0 || n.rx_sec > 0) ?? net[0] ?? {};

    const drives = (disks ?? [])
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
      gpu_usage:
        gpu.utilizationGpu != null ? +gpu.utilizationGpu : null,
      gpu_temp:
        gpu.temperatureGpu != null ? +gpu.temperatureGpu : null,
      gpu_vram_used_mb:
        gpu.memoryUsed != null ? +gpu.memoryUsed : null,
      gpu_vram_total_mb:
        gpu.memoryTotal != null ? +gpu.memoryTotal : null,
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
      raw: { cpu, cpuTemp, cpuSpeed, graphics, mem, net: activeNet, time, disks },
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
      console.error(
        `✗ Failed to send metrics: ${res.status} ${text}`
      );
    }
  } catch (err) {
    console.error(`✗ Failed to send metrics: ${err.message}`);
  }
}

console.log("Mycelium PC Agent started");
collectAndSend();
setInterval(collectAndSend, config.POLL_INTERVAL_MS);
