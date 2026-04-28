const os = require("os");

function bytesToGb(value) {
  return Math.round((value / 1024 / 1024 / 1024) * 10) / 10;
}

function getSystemInfo() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    uptimeSeconds: os.uptime(),
    cpuModel: cpus[0]?.model || "Unknown CPU",
    cpuCores: cpus.length,
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
