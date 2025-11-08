const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const mongoose = require('mongoose');
const User = require('../models/User');

module.exports = function(passport) {
    // --- GOOGLE STRATEGY ---
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.SERVER_URL}/api/auth/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Check kung may user na gamit ang Google ID
            let user = await User.findOne({ googleId: profile.id });

            if (user) {
                // Kung meron na, i-return ang user
                return done(null, user);
            } else {
                // Check kung may user na gamit ang email
                user = await User.findOne({ email: profile.emails[0].value });
                
                if (user) {
                    // I-link ang Google ID sa existing email account
                    user.googleId = profile.id;
                    user.avatarUrl = user.avatarUrl || profile.photos[0].value;
                    await user.save();
                    return done(null, user);
                } else {
                    // Gumawa ng bagong user
                    const newUser = await User.create({
                        googleId: profile.id,
                        name: profile.displayName,
                        email: profile.emails[0].value,
                        avatarUrl: profile.photos[0].value,
                        isVerified: true, // Automatic verified
                        username: profile.emails[0].value.split('@')[0] + Math.floor(100 + Math.random() * 900)
                    });
                    return done(null, newUser);
                }
            }
        } catch (err) {
            console.error('Google Strategy Error:', err);
            return done(err, false);
        }
    }));
    
    // --- FACEBOOK STRATEGY ---
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: `${process.env.SERVER_URL}/api/auth/facebook/callback`,
        profileFields: ['id', 'displayName', 'emails', 'photos'] // Hihingin natin ang email
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Check kung may user na gamit ang Facebook ID
            let user = await User.findOne({ facebookId: profile.id });

            if (user) {
                return done(null, user);
            } else {
                // Check kung may email na binigay ang FB
                const email = (profile.emails && profile.emails[0].value) ? profile.emails[0].value : null;
                
                if (email) {
                    user = await User.findOne({ email: email });
                    if (user) {
                        // I-link ang FB ID sa existing email
                        user.facebookId = profile.id;
                        user.avatarUrl = user.avatarUrl || (profile.photos && profile.photos[0].value);
                        await user.save();
                        return done(null, user);
                    }
                }
                
                // Gumawa ng bagong user
                const newUser = await User.create({
                    facebookId: profile.id,
                    name: profile.displayName,
                    email: email, // Pwedeng maging null kung 'di binigay ng user
                    avatarUrl: (profile.photos && profile.photos[0].value),
                    isVerified: true,
                    username: 'fb_user_' + profile.id
                });
                return done(null, newUser);
            }
        } catch (err) {
            console.error('Facebook Strategy Error:', err);
            return done(err, false);
        }
    }));
    
    // Hindi na natin kailangan ng serialize/deserialize dahil JWT ang gamit natin (stateless)
};