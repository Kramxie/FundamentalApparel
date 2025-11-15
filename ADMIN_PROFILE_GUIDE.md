# Admin Profile Setup Guide

## Overview
The Admin Profile page allows administrators to manage their account security and create employee accounts with access to the admin panel.

## Features

### 1. Admin Profile Management
- View admin information (name, email, role)
- Change password with email verification (3-step process)
- Secure authentication with JWT tokens

### 2. Employee Account Creation (Admin Only)
- Create new employee accounts
- Assign admin panel access
- Automatic welcome email to employees
- Password validation (minimum 8 characters)

## Files Created/Modified

### Frontend
- `client/admin/profile.html` - Admin profile page with responsive sidebar navigation

### Backend
- `server/controllers/adminController.js` - Handles password changes and employee creation
- `server/routes/adminRoutes.js` - API routes for admin operations
- `server/models/User.js` - Updated to include 'employee' role

### Server Configuration
- `server/server.js` - Registered admin routes at `/api/admin`

## API Endpoints

### Password Change Flow

#### 1. Send Verification Code
```
POST /api/admin/send-verification-code
Headers: Authorization: Bearer <token>
Body: { "currentPassword": "string" }
Response: { "success": true, "msg": "Verification code sent to your email" }
```

#### 2. Verify Code
```
POST /api/admin/verify-code
Headers: Authorization: Bearer <token>
Body: { "code": "123456" }
Response: { "success": true, "verificationToken": "string" }
```

#### 3. Update Password
```
PATCH /api/admin/update-password
Headers: Authorization: Bearer <token>
Body: { 
  "newPassword": "string", 
  "verificationToken": "string" 
}
Response: { "success": true, "msg": "Password updated successfully" }
```

### Employee Management

#### Create Employee (Admin Only)
```
POST /api/admin/create-employee
Headers: Authorization: Bearer <token>
Body: {
  "name": "John Doe",
  "email": "john@company.com",
  "password": "securepass123"
}
Response: {
  "success": true,
  "msg": "Employee account created successfully",
  "data": {
    "id": "...",
    "name": "John Doe",
    "email": "john@company.com",
    "role": "employee"
  }
}
```

## Password Change Process

1. **Step 1: Enter Current Password**
   - Admin clicks "Change Password" button
   - Modal opens requesting current password
   - System verifies password and sends 6-digit code to email
   - Code expires in 10 minutes

2. **Step 2: Verify Code**
   - Admin enters 6-digit code from email
   - System verifies code and generates verification token
   - Token valid for 5 minutes

3. **Step 3: Set New Password**
   - Admin enters new password (minimum 8 characters)
   - Confirms password
   - System updates password and clears verification data

## Security Features

- **JWT Authentication**: All routes protected with Bearer token
- **Role-Based Access**: Employee creation restricted to admins only
- **Password Hashing**: Bcrypt with salt rounds
- **Code Expiration**: Verification codes expire after 10 minutes
- **Token Expiration**: Verification tokens expire after 5 minutes
- **Email Verification**: Codes sent via email for password changes
- **Input Validation**: 
  - Password minimum 8 characters
  - Email format validation
  - Duplicate email checks

## User Roles

### Admin
- Full access to all features
- Can create employee accounts
- Can change own password
- Access to all admin panel sections

### Employee
- Access to admin panel
- Can change own password
- Cannot create other employee accounts
- Employee management section hidden

## UI/UX Features

- **Responsive Design**: Mobile-friendly with Tailwind CSS
- **Sidebar Navigation**: Fixed sidebar with links to all admin pages
- **Modal Dialogs**: 3-step password change flow
- **Password Visibility Toggle**: Show/hide password fields
- **Loading States**: Spinners during API calls
- **Success/Error Messages**: Toast notifications for user feedback
- **Form Validation**: Client-side validation before submission
- **Accessibility**: ARIA labels and semantic HTML

## Setup Instructions

### 1. Environment Variables
Ensure the following are set in `.env`:
```
JWT_SECRET=your_jwt_secret
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
FRONTEND_URL=http://localhost:5500
```

### 2. Email Configuration
The system uses the existing `sendEmail` utility in `server/utils/sendEmail.js`. Ensure your email provider is properly configured.

### 3. Create First Admin User
If no admin exists, create one directly in MongoDB:
```javascript
{
  "name": "Admin User",
  "email": "admin@fundamental.com",
  "password": "hashedpassword", // Hash with bcrypt
  "role": "admin",
  "isVerified": true
}
```

Or use the registration endpoint with role override.

### 4. Access the Profile Page
Navigate to: `/client/admin/profile.html`

## Navigation Links
The sidebar includes links to:
- Dashboard (`/admin/index.html`)
- Add Product (`/admin/add-product.html`)
- Manage Products (`/admin/manage-products.html`)
- Inventory (`/admin/inventory.html`)
- Orders (`/admin/orders.html`)
- Vouchers (`/admin/vouchers.html`)
- Messages (`/admin/messages.html`)
- Profile (`/admin/profile.html`) ✓ Active

## Error Handling

### Common Errors

1. **"Current password is incorrect"**
   - User entered wrong password in Step 1
   - Solution: Try again with correct password

2. **"Invalid verification code"**
   - Wrong code entered in Step 2
   - Solution: Check email for correct code

3. **"Verification code expired"**
   - 10 minutes passed since code was sent
   - Solution: Restart password change process

4. **"Email already registered"**
   - Employee email already exists
   - Solution: Use different email or check existing accounts

5. **"Access denied. Admin privileges required."**
   - Non-admin trying to create employee
   - Solution: Log in with admin account

## Testing

### Test Password Change
1. Log in as admin
2. Click "Change Password"
3. Enter current password
4. Check email for 6-digit code
5. Enter code
6. Set new password
7. Verify login with new password

### Test Employee Creation
1. Log in as admin
2. Scroll to "Employee Management"
3. Fill in name, email, password
4. Click "Create Employee"
5. Check success message
6. Verify employee can log in at `/admin/login.html`

## Best Practices

1. **Password Requirements**: Enforce strong passwords (minimum 8 characters)
2. **Email Verification**: Always verify identity before password changes
3. **Token Management**: Use short expiration times for verification tokens
4. **Role Checks**: Validate user role on both frontend and backend
5. **Error Messages**: Provide clear, actionable error messages
6. **Audit Logging**: Consider logging password changes and employee creations
7. **Email Templates**: Use professional email templates for verification codes

## Future Enhancements

- [ ] Two-factor authentication (2FA)
- [ ] Password strength meter
- [ ] Employee list and management (edit, delete)
- [ ] Account activity logs
- [ ] Password reset via email (forgot password)
- [ ] Profile picture upload
- [ ] Account settings (notifications, preferences)
- [ ] Session management (view active sessions)
- [ ] IP whitelisting for admin access

## Troubleshooting

### Email Not Sending
- Check `.env` email configuration
- Verify SMTP credentials
- Check spam folder
- Ensure email service allows less secure apps (or use app-specific password)

### Authorization Errors
- Clear localStorage and log in again
- Check token expiration
- Verify user role in database

### UI Not Loading
- Check browser console for errors
- Verify all script dependencies loaded
- Check network tab for failed API calls

## Support
For issues or questions, check:
- Server logs for API errors
- Browser console for frontend errors
- MongoDB logs for database issues
