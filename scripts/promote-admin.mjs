import { promoteSuperAdminByEmail } from '../api/_lib/local-db.js';

const email = String(process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();

if (!email) {
  console.error('Usage: npm run admin:promote -- user@example.com');
  process.exitCode = 1;
} else {
  try {
    const user = promoteSuperAdminByEmail(email);
    console.log(`Super admin enabled: ${user.email}`);
  } catch (error) {
    console.error(error?.code === 'USER_NOT_FOUND' ? `User not found: ${email}` : 'Failed to enable super admin.');
    process.exitCode = 1;
  }
}
