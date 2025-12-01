const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  // Reference to User account (optional - may not have account yet)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Basic info
  name: {
    type: String,
    required: [true, 'Employee name is required']
  },
  email: {
    type: String,
    required: [true, 'Employee email is required'],
    unique: true,
    lowercase: true
  },
  contactNumber: {
    type: String,
    default: ''
  },
  position: {
    type: String,
    default: 'Staff'
  },
  
  // Account status
  hasAccount: {
    type: Boolean,
    default: false
  },
  accountCreatedAt: {
    type: Date,
    default: null
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Notes
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for searching
employeeSchema.index({ email: 1 });
employeeSchema.index({ name: 'text', email: 'text', position: 'text' });

module.exports = mongoose.model('Employee', employeeSchema);
