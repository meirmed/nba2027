// Usage: GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/set-admin.mjs owner@email.com
// Sets the {admin:true} custom claim (bootstrap first admin). Later admins are set via an admin callable.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
if (!email) { console.error('email required'); process.exit(1); }
initializeApp({ credential: applicationDefault() });
const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
console.log('admin claim set for', user.uid, '- user must sign out/in to refresh token');
