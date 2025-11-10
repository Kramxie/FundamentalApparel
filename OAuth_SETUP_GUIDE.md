# 🔐 OAuth Setup Guide (Google & Facebook Login)

This guide will help you set up Google and Facebook login for your e-commerce project.

## ✅ What's Already Done

The code is already implemented! You just need to configure the credentials.

## 🚀 Quick Setup Steps

### 1. **Update Your `.env` File (Server)**

Make sure your `server/.env` file has these variables:

```env
# Your existing variables...
MONGO_URI=mongodb://127.0.0.1:27017/fundamental_db
JWT_SECRET=796ee169a75a5442cc87740a81d37372d8a22b8a29fdafb602eb56f33aa0bce0

# OAuth Credentials
GOOGLE_CLIENT_ID=651290672335-8h0becl8jb6cutmgtsqv21743vnd4gv9.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
FACEBOOK_APP_ID=801233042753173
FACEBOOK_APP_SECRET=94e148070bb6ae585f9df2f114eb86fb

# Server & Client URLs
SERVER_URL=https://unmumbled-balloonlike-gayle.ngrok-free.dev
CLIENT_URL=https://unmumbled-balloonlike-gayle.ngrok-free.dev/client
```

### 2. **Update Client-Side API Base URL**

In `client/login.html` and `client/register.html`, update the `API_BASE` constant:

```javascript
const API_BASE = 'http://localhost:5000'; // For local development
// OR
const API_BASE = 'https://your-ngrok-url.ngrok-free.dev'; // For ngrok
```

### 3. **Configure Google OAuth Redirect URIs**

Go to [Google Cloud Console](https://console.cloud.google.com/):

1. Select your project
2. Go to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:5000/api/auth/google/callback
   https://your-ngrok-url.ngrok-free.dev/api/auth/google/callback
   ```

### 4. **Configure Facebook OAuth Redirect URIs**

Go to [Facebook Developers](https://developers.facebook.com/):

1. Select your app
2. Go to **Facebook Login** → **Settings**
3. Under **Valid OAuth Redirect URIs**, add:
   ```
   http://localhost:5000/api/auth/facebook/callback
   https://your-ngrok-url.ngrok-free.dev/api/auth/facebook/callback
   ```

## 🧪 Testing OAuth Flow

### Local Testing (localhost)
1. Start your server: `cd server && npm start`
2. Open your client in browser: `http://127.0.0.1:5500/client/login.html`
3. Click "Continue with Google" or "Continue with Facebook"
4. You should be redirected back after authentication

### Production/Ngrok Testing
1. Start ngrok: `ngrok http 5000`
2. Update `.env` with your ngrok URL
3. Update OAuth redirect URIs in Google/Facebook dashboards
4. Restart your server
5. Access via ngrok URL

## 🔍 How It Works

1. **User clicks OAuth button** → Redirects to `/api/auth/google` or `/api/auth/facebook`
2. **Passport authenticates** → User logs in with Google/Facebook
3. **Callback receives user data** → Creates/updates user in database
4. **JWT token generated** → Redirects to `auth-success.html?token=YOUR_TOKEN`
5. **Token saved to localStorage** → Redirects to `profile.html`

## ❗ Common Issues & Solutions

### Issue: "Redirect URI mismatch"
**Solution:** Make sure the redirect URI in Google/Facebook dashboard exactly matches your `SERVER_URL` in `.env`

### Issue: OAuth buttons not working
**Solution:** 
- Check browser console for errors
- Verify `API_BASE` is correct in login.html/register.html
- Make sure server is running

### Issue: "Failed to fetch user info"
**Solution:**
- Verify API credentials are correct
- Check if the OAuth app is in "Testing" mode (allow test users)
- Ensure email scope is requested

### Issue: Users created but can't login
**Solution:**
- OAuth users have `isVerified: true` by default
- They don't have passwords (uses Google/Facebook authentication)
- Check User model to ensure `googleId` or `facebookId` is saved

## 📁 Files Modified

- ✅ `client/login.html` - Added OAuth buttons and handlers
- ✅ `client/register.html` - Added OAuth buttons and handlers
- ✅ `client/auth-success.html` - Handles OAuth callback
- ✅ `server/routes/authRoutes.js` - OAuth routes configured
- ✅ `server/config/passport.js` - Passport strategies configured
- ✅ `server/models/User.js` - Support for googleId/facebookId

## 🎯 Next Steps

1. Test login with both Google and Facebook
2. Verify users are created in MongoDB
3. Check that profile page loads correctly
4. Test logout and re-login functionality

## 💡 Tips

- Use ngrok for testing with real OAuth providers
- Keep your OAuth secrets secure (never commit to GitHub)
- Use `.gitignore` to exclude `.env` file
- OAuth users skip email verification (already verified by Google/Facebook)

---

**Need help?** Check the browser console and server logs for detailed error messages.
