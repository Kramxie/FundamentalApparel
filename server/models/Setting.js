const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  store: {
    name: { type: String, default: 'Fundamental Apparel' },
    address: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
    email: { type: String, default: '' },
    aboutUs: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    bannerUrl: { type: String, default: '' }
  },
  websiteContent: {
    faqs: { type: String, default: '' },
    shippingInfo: { type: String, default: '' },
    returnsPolicy: { type: String, default: '' },
    terms: { type: String, default: '' },
    homepageBanners: [{ type: String }]
  },
  roles: [{
    name: { type: String, required: true },
    permissions: [{ type: String }]
  }],
  staff: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    email: String,
    role: String
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Setting', SettingsSchema);
