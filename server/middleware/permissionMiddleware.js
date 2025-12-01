const Setting = require('../models/Setting');

// Simple RBAC: check if the current user's role has the required permission.
// Usage: requirePermission('manage_inventory')
exports.requirePermission = function(permission) {
  return async function(req, res, next) {
    try {
      if (!req.user) return res.status(401).json({ success: false, msg: 'Authentication required' });
      // Admin bypass
      if (req.user.role === 'admin') return next();

      // Load roles from settings
      const s = await Setting.findOne().lean();
      const roles = (s && s.roles) || [];
      const roleName = req.user.role;
      if (!roleName) return res.status(403).json({ success: false, msg: 'Access denied' });

      const roleDef = roles.find(r => String(r.name).toLowerCase() === String(roleName).toLowerCase());
      if (!roleDef) return res.status(403).json({ success: false, msg: 'Role not found or no permissions assigned' });

      const perms = roleDef.permissions || [];
      if (perms.includes('*') || perms.includes(permission)) return next();

      return res.status(403).json({ success: false, msg: 'Permission denied' });
    } catch (err) {
      console.error('requirePermission error', err);
      return res.status(500).json({ success: false, msg: 'Server error checking permissions' });
    }
  };
};
