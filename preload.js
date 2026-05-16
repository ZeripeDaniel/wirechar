const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wirechar', {
  getDevices: () => ipcRenderer.invoke('get-devices'),
  startCapture: (deviceName, filter) => ipcRenderer.invoke('start-capture', deviceName, filter),
  stopCapture: () => ipcRenderer.invoke('stop-capture'),
  applyFilter: (filter) => ipcRenderer.invoke('apply-filter', filter),
  getHexDump: (frameNumber) => ipcRenderer.invoke('get-hex-dump', frameNumber),
  logInfo:    ()             => ipcRenderer.invoke('log-info'),
  logList:    ()             => ipcRenderer.invoke('log-list'),
  logSearch:  (opts)         => ipcRenderer.invoke('log-search', opts),
  logDiskUsage: ()           => ipcRenderer.invoke('log-disk-usage'),
  logClear:   ()             => ipcRenderer.invoke('log-clear-with-confirm'),
  logClearForce: (opts)      => ipcRenderer.invoke('log-clear-force', opts),
  logDir:     ()             => ipcRenderer.invoke('log-dir'),
  logOpenDir: ()             => ipcRenderer.invoke('log-open-dir'),

  // Persistent IP→host cache
  iphostAll:   ()            => ipcRenderer.invoke('iphost-all'),
  iphostBatch: (pairs)       => ipcRenderer.invoke('iphost-batch', pairs),
  iphostClear: ()            => ipcRenderer.invoke('iphost-clear'),
  iphostSize:  ()            => ipcRenderer.invoke('iphost-size'),
  iphostUnset: (ip)          => ipcRenderer.invoke('iphost-unset', ip),

  // User-managed whitelist (per-install, persistent)
  userWhitelistAdd:    (ip, host) => ipcRenderer.invoke('user-whitelist-add', ip, host),
  userWhitelistRemove: (ip)       => ipcRenderer.invoke('user-whitelist-remove', ip),
  userWhitelistList:   ()         => ipcRenderer.invoke('user-whitelist-list'),
  userWhitelistHas:    (ip)       => ipcRenderer.invoke('user-whitelist-has', ip),
  userWhitelistClear:  ()         => ipcRenderer.invoke('user-whitelist-clear'),

  // Diagnostics
  appVersion:    ()  => ipcRenderer.invoke('app-version'),
  detectorStats: ()  => ipcRenderer.invoke('detector-stats'),
  onIphostLearned: (cb)      => ipcRenderer.on('iphost-learned', (_, e) => cb(e)),
  onLogPolicyChanged: (cb)   => ipcRenderer.on('log-policy-changed', (_, p) => cb(p)),

  // Generic settings (persisted in settings.json)
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // Language settings (shared with main process)
  getLangFromMain: ()        => ipcRenderer.invoke('get-lang'),
  setLangToMain:   (lang)    => ipcRenderer.invoke('set-lang', lang),
  hintLang:        (lang)    => ipcRenderer.invoke('hint-lang', lang),
  onLangChanged:   (cb)      => ipcRenderer.on('lang-changed', (_, lang) => cb(lang)),

  // WinDivert real-time blocking status (NSIS build only)
  windivertInfo:   ()        => ipcRenderer.invoke('windivert-info'),
  onWindivertStatus: (cb)    => ipcRenderer.on('windivert-status', (_, s) => cb(s)),
  onWindivertStats:  (cb)    => ipcRenderer.on('windivert-stats',  (_, s) => cb(s)),

  // Tray-initiated defense mode change → renderer reconciles its state
  onDefenseModeChanged: (cb) => ipcRenderer.on('defense-mode-changed', (_, mode) => cb(mode)),

  // Defense mode
  setDefenseMode: (mode) => ipcRenderer.invoke('set-defense-mode', mode),
  getDefenseState: () => ipcRenderer.invoke('get-defense-state'),
  blockIP: (ip) => ipcRenderer.invoke('block-ip', ip),
  unblockIP: (ip) => ipcRenderer.invoke('unblock-ip', ip),
  unblockAll: () => ipcRenderer.invoke('unblock-all'),

  onPackets: (cb) => ipcRenderer.on('packets', (_, pkts) => cb(pkts)),
  onCaptureError: (cb) => ipcRenderer.on('capture-error', (_, msg) => cb(msg)),
  onCaptureStarted: (cb) => ipcRenderer.on('capture-started', (_, device) => cb(device)),
  onCaptureRestarting: (cb) => ipcRenderer.on('capture-restarting', (_, info) => cb(info)),
  onAttackDetected: (cb) => ipcRenderer.on('attack-detected', (_, e) => cb(e)),
  onAttackConfirmed: (cb) => ipcRenderer.on('attack-confirmed', (_, e) => cb(e)),
  onAttackEnded: (cb) => ipcRenderer.on('attack-ended', (_, e) => cb(e)),
  onAttackStats: (cb) => ipcRenderer.on('attack-stats', (_, e) => cb(e)),
  onIPBlocked: (cb) => ipcRenderer.on('ip-blocked', (_, e) => cb(e)),
  onIPUnblocked: (cb) => ipcRenderer.on('ip-unblocked', (_, e) => cb(e)),

  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
});
