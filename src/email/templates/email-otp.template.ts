export const generateOtpEmailTemplate = (otp: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2>Your Verification Code</h2>
      <p>Please use the following code to complete your login. This code will expire in 10 minutes.</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</p>
      <p>If you did not request this code, you can safely ignore this email.</p>
    </div>
  `;
};
