import { getSession } from '../db/queries';

export async function isDashboardAuthenticated(cookies: any): Promise<boolean> {
  const sessionId = cookies.get('dashboard_auth')?.value;
  if (!sessionId) return false;
  
  const session = await getSession(sessionId);
  return !!session;
}
