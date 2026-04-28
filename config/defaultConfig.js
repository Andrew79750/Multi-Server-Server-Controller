const desktop = "C:\\Users\\Administrator\\Desktop";

module.exports = {
  appVersion: "1.0.0",
  theme: "dark",
  notificationTimeout: 4500,
  appUpdates: {
    enabled: true,
    checkOnStartup: true,
    notifyOnUpdate: true,
    checkIntervalMinutes: 30,
    skippedVersion: null,
    github: {
      owner: "Andrew79750",
      repo: "Multi-Server-Server-Controller"
    }
  },
  github: {
    enabled: true,
    uiRefreshSeconds: 1,
    fetchCooldownSeconds: 30,
    pullOnUpdate: true,
    repos: [
      {
        id: "life_server",
        name: "Altis Life Server",
        path: `${desktop}\\ESS ArmA 3 Altis Server\\@life_server\\addons\\life_server`,
        enabled: true
      },
      {
        id: "life_hc",
        name: "Altis Life HC",
        path: `${desktop}\\ESS ArmA 3 Altis Server\\@life_hc\\addons\\life_hc`,
        enabled: true
      },
      {
        id: "altis_life_mission",
        name: "Altis Life Mission",
        path: `${desktop}\\ESS ArmA 3 Altis Server\\mpmissions\\Altis_Life.Altis`,
        enabled: true
      },
      {
        id: "cqc_mission",
        name: "CQC Mission",
        path: `${desktop}\\ESS ArmA 3 Server\\mpmissions\\CQC.Altis`,
        enabled: true
      },
      {
        id: "website",
        name: "Controller Website",
        path: `${desktop}\\ESS-Server Controller Website`,
        enabled: true
      },
      {
        id: "fivem_core",
        name: "FiveM ESS Core",
        path: `${desktop}\\ESS FiveM Server\\ESS-Core`,
        enabled: true
      }
    ]
  },
  servers: [
    {
      id: "fivem",
      name: "FiveM Server",
      type: "FiveM",
      rootPath: `${desktop}\\ESS FiveM Server`,
      command: "",
      args: [],
      enabled: true
    },
    {
      id: "arma3_cqc",
      name: "ArmA 3 CQC Server",
      type: "ArmA 3",
      rootPath: `${desktop}\\ESS ArmA 3 Server`,
      command: "",
      args: [],
      enabled: true
    },
    {
      id: "arma3_altis_life",
      name: "ArmA 3 Altis Life Server",
      type: "ArmA 3",
      rootPath: `${desktop}\\ESS ArmA 3 Altis Server`,
      command: "",
      args: [],
      enabled: true
    },
    {
      id: "website",
      name: "Server Controller Website",
      type: "Website",
      rootPath: `${desktop}\\ESS-Server Controller Website`,
      command: "",
      args: [],
      url: "http://localhost",
      enabled: true
    }
  ]
};
