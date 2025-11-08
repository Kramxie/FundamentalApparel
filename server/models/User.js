const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ... (addressSchema at voucherSchema ay walang bago) ...
const addressSchema = new mongoose.Schema({
    street: { type: String, required: true },
    city: { type: String, required: true },
    province: { type: String, required: true },
    zipCode: { type: String, required: true },
    isDefault: { type: Boolean, default: false }
});
const voucherSchema = new mongoose.Schema({
    code: { type: String, required: true },
    description: { type: String, required: true },
    type: {
        type: String,
        enum: ['percentage', 'fixed', 'free_shipping'],
        required: true
    },
    value: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name']
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        sparse: true, // Ginagawang optional ang unique constraint kung null
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    // --- NEW OAUTH FIELDS ---
    googleId: {
        type: String
    },
    facebookId: {
        type: String
    },
    avatarUrl: {
        type: String,
        default: ''
    },
    // --- END NEW OAUTH FIELDS ---
    username: {
        type: String,
        unique: true,
        sparse: true 
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other', ''],
        default: ''
    },
    dob: {
        type: Date
    },
    usernameLastChanged: {
        type: Date
    },
    contactNumber: {
        type: String,
        default: ''
    },
    password: {
        type: String,
        // Hindi na required dahil pwede kang mag-login via Google/FB
        required: false, 
        minlength: 6,
        select: false 
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isVerified: {
        type: Boolean,
        default: true // Gawing true by default para sa social logins
    },
    verificationCode: String,
    verificationCodeExpire: Date,
    shippingAddresses: [addressSchema],
    vouchers: [voucherSchema],
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    }, {
        timestamps: true
    }
);

userSchema.pre('save', async function(next) {
    // Hash lang ang password kung binago ito AT hindi ito social login
    if (!this.isModified('password') || !this.password) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
    // Check muna kung may password ang user
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);