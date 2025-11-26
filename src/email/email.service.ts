import nodemailer from 'nodemailer';
import { config } from '../config/config';
import logger from '../common/utils/logger';
import { generateOtpEmailTemplate } from './templates/email-otp.template';
import { IUser } from '../modules/users/user.model';

const transporter = nodemailer.createTransport({
  host: config.email.smtp.host,
  port: config.email.smtp.port,
  secure: config.email.smtp.port === 465, // true for 465, false for other ports
  auth: {
    user: config.email.smtp.auth.user,
    pass: config.email.smtp.auth.pass,
  },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
  const msg = { from: config.email.from, to, subject, html };
  try {
    await transporter.sendMail(msg);
    logger.info(`Email sent to ${to} with subject: ${subject}`);
  } catch (error) {
    logger.error(`Unable to send email to ${to}: ${error}`);
  }
};

/**
 * Sends a verification OTP email to the user.
 * @param user The user object containing the email address.
 * @param otp The One-Time Password to send.
 */
export const sendVerificationOtpEmail = async (user: IUser, otp: string) => {
  const subject = 'Your Login Verification Code';
  const html = generateOtpEmailTemplate(otp);
  await sendEmail(user.email, subject, html);
};
