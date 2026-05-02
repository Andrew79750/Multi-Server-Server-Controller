const os = require("os");

let lastCpuSnapshot = null;

function bytesToGb(value) {
  return Math.round((value / 1024 / 1024 / 1024) * 10) / 10;
}

function snapshotCpu() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function calculateCpuUsage(currentSnapshot) {
  if (!lastCpuSnapshot || lastCpuSnapshot.length !== currentSnapshot.length) return null;

  let idleDelta = 0;
  let totalDelta = 0;

  currentSnapshot.forEach((current, index) => {
    const previous = lastCpuSnapshot[index];
    const currentTotal = Object.values(current).reduce((sum, value) => sum + value, 0);
    const previousTotal = Object.values(previous).reduce((sum, value) => sum + value, 0);
    idleDelta += current.idle - previous.idle;
    totalDelta += currentTotal - previousTotal;
  });

  if (totalDelta <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

function getSystemInfo() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  const cpuSnapshot = snapshotCpu();
  const cpuUsedPercent = calculateCpuUsage(cpuSnapshot);
  lastCpuSnapshot = cpuSnapshot;

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    uptimeSeconds: os.uptime(),
    cpuModel: cpus[0]?.model || "Unknown CPU",
    cpuCores: cpus.length,
    cpuUsedPercent,
    loadAverage: os.loadavg(),
    memory: {
      totalGb: bytesToGb(totalMem),
      usedGb: bytesToGb(usedMem),
      freeGb: bytesToGb(freeMem),
      usedPercent: Math.round((usedMem / totalMem) * 100)
    }
  };
}

module.exports = { getSystemInfo };
