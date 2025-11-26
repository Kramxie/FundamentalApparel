const path = require('path');
const fs = require('fs');

const FILE = path.join(__dirname, '..', 'config', 'deliveryRates.json');

function readConfig() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    // fallback default
    return {
      defaultRate: 120,
      rates: {
        'metro manila': 120
      }
    };
  }
}

function saveConfig(obj) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[deliveryRates] Failed to save config:', e && e.message);
    return false;
  }
}

module.exports = {
  getRates: readConfig,
  saveRates: saveConfig,
  FILE
};
