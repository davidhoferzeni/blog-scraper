import nodemailer from 'nodemailer';

/**
 *
 * @param {string} service
 * @param {import("nodemailer/lib/smtp-connection").Credentials} credentials
 * @param {string} recipients
 * @param {import("nodemailer/lib/mailer").Attachment[]} attachments
 */
export async function sendFile(service, credentials, recipients, attachments) {
    const transporter = nodemailer.createTransport({
        service: service,
        auth: credentials,
    });
    /** @type {import("nodemailer/lib/smtp-transport").MailOptions} */
    const mailOptions = {
        from: credentials.user,
        to: recipients,
        attachments,
        html: '<div dir="auto"></div>',
    };
    transporter.sendMail(mailOptions);
}
