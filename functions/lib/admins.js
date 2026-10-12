import { getAuth } from 'firebase-admin/auth';

/** uids of every account with the admin claim. Admins are NOT players: no picks, no points, not in any table. (~60 accounts: one cheap call.) */
export async function adminUidSet() {
  const out = new Set();
  let token;
  do {
    const r = await getAuth().listUsers(1000, token);
    r.users.forEach((u) => { if (u.customClaims?.admin === true) out.add(u.uid); });
    token = r.pageToken;
  } while (token);
  return out;
}
