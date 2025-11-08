const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // 1. Create a transporter using Gmail
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS, // This should be the 16-digit App Password
        },
        tls: {
            rejectUnauthorized: false // This allows self-signed certificates
        },
    });

    // 2. Define the email options
    const mailOptions = {
        from: `Fundamental Apparel <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        html: options.message,
    };

    // 3. Actually send the email
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return info;
    } catch (error) {
        console.error('Email sending failed:', error);
        throw error;
    }
};

module.exports = sendEmail;

