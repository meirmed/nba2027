import PageShell from '../components/PageShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import UserPointsView from './UserPointsView.jsx';

export default function MyPointsPage() {
  const { user } = useAuth();
  return <PageShell titleKey="nav.myPoints"><UserPointsView uid={user.uid} self /></PageShell>;
}
