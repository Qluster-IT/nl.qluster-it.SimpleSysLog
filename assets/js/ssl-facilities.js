'use strict';

(function (root) {
  var facilities = Object.freeze({
    0: 'Kernel',
    1: 'User',
    2: 'Mail',
    3: 'System',
    4: 'Authorization',
    5: 'Syslog',
    6: 'LPR',
    7: 'News',
    8: 'UUCP',
    9: 'Cron',
    10: 'Daemon',
    11: 'FTP',
    12: 'NTP',
    13: 'Audit',
    14: 'Alert',
    15: 'Clock',
    16: 'Flow',
    17: 'Device',
    18: 'App',
    19: 'Scene',
    20: 'Trigger',
    21: 'Condition',
    22: 'Action',
    23: 'Variable'
  });

  if (typeof module === 'object' && module.exports) module.exports = facilities;
  else root.SSLFacilities = facilities;
}(typeof self !== 'undefined' ? self : this));
