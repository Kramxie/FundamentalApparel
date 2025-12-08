const Setting = require('../models/Setting');
const User = require('../models/User');

// Get settings (single doc pattern)
exports.getSettings = async (req, res) => {
  try {
    let s = await Setting.findOne().lean();
    if (!s) {
      // create default
      s = await Setting.create({});
    }
    res.json({ success: true, data: s });
  } catch (err) {
    console.error('getSettings error', err);
    res.status(500).json({ success: false, msg: 'Server error fetching settings' });
  }
};

// Update store info
exports.updateStoreInfo = async (req, res) => {
  try {
    const { name, address, contactNumber, email, aboutUs } = req.body;
    const update = {
      'store.name': name,
      'store.address': address,
      'store.contactNumber': contactNumber,
      'store.email': email,
      'store.aboutUs': aboutUs
    };
    // Cloudinary stores URL in file.path
    if (req.files && req.files.logo && req.files.logo[0]) {
      update['store.logoUrl'] = req.files.logo[0].path;
    }
    if (req.files && req.files.banner && req.files.banner[0]) {
      update['store.bannerUrl'] = req.files.banner[0].path;
    }
    const s = await Setting.findOneAndUpdate({}, { $set: update, $currentDate: { updatedAt: true } }, { new: true, upsert: true });
    res.json({ success: true, data: s });
  } catch (err) {
    console.error('updateStoreInfo error', err);
    res.status(500).json({ success: false, msg: 'Server error updating store info' });
  }
};

// Update website content
exports.updateWebsiteContent = async (req, res) => {
  try {
    const { faqs, shippingInfo, returnsPolicy, terms } = req.body;
    const update = {
      'websiteContent.faqs': faqs,
      'websiteContent.shippingInfo': shippingInfo,
      'websiteContent.returnsPolicy': returnsPolicy,
      'websiteContent.terms': terms
    };
    // homepage banners optional multiple files (Cloudinary)
    if (req.files && req.files.homepageBanners) {
      const urls = req.files.homepageBanners.map(f => f.path);
      update['websiteContent.homepageBanners'] = urls;
    }
    const s = await Setting.findOneAndUpdate({}, { $set: update, $currentDate: { updatedAt: true } }, { new: true, upsert: true });
    res.json({ success: true, data: s });
  } catch (err) {
    console.error('updateWebsiteContent error', err);
    res.status(500).json({ success: false, msg: 'Server error updating website content' });
  }
};

// Staff & roles management
exports.getStaffAndRoles = async (req, res) => {
  try {
    const s = await Setting.findOne().lean();
    const roles = (s && s.roles) || [
      { name: 'Owner', permissions: ['*'] },
      { name: 'Manager', permissions: ['manage_products','manage_orders','view_reports'] },
      { name: 'Inventory Staff', permissions: ['manage_inventory'] }
    ];
    let staff = (s && s.staff) || [];

    // If no staff entries stored in settings, fall back to users with role 'employee'
    if ((!staff || staff.length === 0)) {
      try {
        const employees = await User.find({ role: 'employee' }).select('name email _id role').lean();
        if (employees && employees.length) {
          staff = employees.map(u => ({ userId: u._id, name: u.name || '', email: u.email || '', role: u.role || 'employee' }));
        }
      } catch (e) {
        console.error('fallback staff load error', e);
      }
    }
    res.json({ success: true, data: { roles, staff } });
  } catch (err) {
    console.error('getStaffAndRoles error', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Roles CRUD
exports.getRoles = async (req, res) => {
  try {
    const s = await Setting.findOne().lean();
    const roles = (s && s.roles) || [
      { name: 'Owner', permissions: ['*'] },
      { name: 'Manager', permissions: ['manage_products','manage_orders','view_reports'] },
      { name: 'Inventory Staff', permissions: ['manage_inventory'] }
    ];
    res.json({ success: true, data: roles });
  } catch (err) {
    console.error('getRoles error', err); res.status(500).json({ success: false, msg: 'Server error' });
  }
};

exports.addRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    if (!name) return res.status(400).json({ success: false, msg: 'Role name required' });
    const s = await Setting.findOne() || await Setting.create({});
    s.roles = s.roles || [];
    if (s.roles.find(r => String(r.name).toLowerCase() === String(name).toLowerCase())) return res.status(400).json({ success: false, msg: 'Role already exists' });
    s.roles.push({ name, permissions: Array.isArray(permissions) ? permissions : [] });
    s.updatedAt = new Date(); await s.save();
    res.json({ success: true, data: s.roles });
  } catch (err) { console.error('addRole error', err); res.status(500).json({ success: false, msg: 'Server error' }); }
};

exports.updateRole = async (req, res) => {
  try {
    const roleName = req.params.name;
    const { name, permissions } = req.body;
    const s = await Setting.findOne(); if (!s) return res.status(404).json({ success: false, msg: 'Settings not found' });
    const idx = (s.roles || []).findIndex(r => String(r.name).toLowerCase() === String(roleName).toLowerCase());
    if (idx < 0) return res.status(404).json({ success: false, msg: 'Role not found' });
    if (name) s.roles[idx].name = name;
    if (permissions) s.roles[idx].permissions = Array.isArray(permissions) ? permissions : s.roles[idx].permissions;
    s.updatedAt = new Date(); await s.save();
    res.json({ success: true, data: s.roles });
  } catch (err) { console.error('updateRole error', err); res.status(500).json({ success: false, msg: 'Server error' }); }
};

exports.deleteRole = async (req, res) => {
  try {
    const roleName = req.params.name;
    const s = await Setting.findOne(); if (!s) return res.status(404).json({ success: false, msg: 'Settings not found' });
    s.roles = (s.roles || []).filter(r => String(r.name).toLowerCase() !== String(roleName).toLowerCase());
    s.updatedAt = new Date(); await s.save();
    res.json({ success: true, data: s.roles });
  } catch (err) { console.error('deleteRole error', err); res.status(500).json({ success: false, msg: 'Server error' }); }
};

exports.addOrUpdateStaff = async (req, res) => {
  try {
    const { userId, name, email, role } = req.body;
    if (!email || !role) return res.status(400).json({ success: false, msg: 'Email and role are required' });
    const s = await Setting.findOne() || await Setting.create({});
    // If userId provided and staff exists, update
    let staff = s.staff || [];
    if (userId) {
      const idx = staff.findIndex(x => x.userId && x.userId.toString() === userId.toString());
      if (idx >= 0) {
        staff[idx].name = name; staff[idx].email = email; staff[idx].role = role;
      } else {
        staff.push({ userId, name, email, role });
      }
    } else {
      // create new staff entry (not linked to User)
      staff.push({ name, email, role });
    }
    s.staff = staff;
    s.updatedAt = new Date();
    await s.save();
    res.json({ success: true, data: s.staff });
  } catch (err) {
    console.error('addOrUpdateStaff error', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const id = req.params.id;
    const s = await Setting.findOne();
    if (!s) return res.status(404).json({ success: false, msg: 'Settings not found' });
    s.staff = (s.staff || []).filter(x => x._id.toString() !== id.toString());
    s.updatedAt = new Date();
    await s.save();
    res.json({ success: true, data: s.staff });
  } catch (err) {
    console.error('deleteStaff error', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};
