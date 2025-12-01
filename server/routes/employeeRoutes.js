const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getAllEmployees,
  getEmployee,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  createEmployeeAccount,
  sendEmployeeMessage,
  resetEmployeePassword
} = require('../controllers/employeeController');

// All routes require authentication and admin role
router.use(protect);
router.use(adminOnly);

// Employee CRUD
router.route('/')
  .get(getAllEmployees)
  .post(addEmployee);

router.route('/:id')
  .get(getEmployee)
  .put(updateEmployee)
  .delete(deleteEmployee);

// Employee account management
router.post('/:id/create-account', createEmployeeAccount);
router.post('/:id/send-message', sendEmployeeMessage);
router.post('/:id/reset-password', resetEmployeePassword);

module.exports = router;
