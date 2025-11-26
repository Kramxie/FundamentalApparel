const deliveryRatesUtil = require('../utils/deliveryRates');

exports.getRates = async (req, res) => {
  try {
    const cfg = deliveryRatesUtil.getRates();
    return res.status(200).json({ success: true, data: cfg });
  } catch (err) {
    console.error('[deliveryRates] getRates error', err && err.message);
    return res.status(500).json({ success: false, msg: 'Failed to load delivery rates' });
  }
};

exports.updateRates = async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, msg: 'Invalid payload' });
    }
    // Basic validation
    const cfg = deliveryRatesUtil.getRates();
    const newCfg = {
      defaultRate: payload.defaultRate || cfg.defaultRate || 120,
      rates: payload.rates && typeof payload.rates === 'object' ? payload.rates : cfg.rates
    };
    const ok = deliveryRatesUtil.saveRates(newCfg);
    if (!ok) return res.status(500).json({ success: false, msg: 'Failed to save rates' });
    return res.status(200).json({ success: true, data: newCfg });
  } catch (err) {
    console.error('[deliveryRates] updateRates error', err && err.message);
    return res.status(500).json({ success: false, msg: 'Failed to update delivery rates' });
  }
};
