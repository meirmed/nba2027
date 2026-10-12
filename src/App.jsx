import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext.jsx';
import { useLang } from './contexts/LangContext.jsx';
import Layout from './components/layout/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import PredictionsPage from './pages/PredictionsPage.jsx';
import MyPointsPage from './pages/MyPointsPage.jsx';
import H2HPage from './pages/H2HPage.jsx';
import RulesPage from './pages/RulesPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import PlayerPage from './pages/PlayerPage.jsx';
const AdminPage = lazy(() => import('./pages/admin/AdminPage.jsx')); // players never download the admin code

const page = (name, el) => <ErrorBoundary name={name}>{el}</ErrorBoundary>; // every page gets a boundary

function Guard({ admin, children }) {
  const { user, isAdmin, loading } = useAuth();
  const { t } = useLang();
  if (loading) return <p className="muted center">{t('common.loading')}</p>;
  if (!user) return <LoginPage />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Guard><Layout /></Guard>}>
          <Route index element={page('home', <HomePage />)} />
          <Route path="leaderboard" element={page('leaderboard', <LeaderboardPage />)} />
          <Route path="results" element={page('results', <ResultsPage />)} />
          <Route path="predictions" element={page('predictions', <PredictionsPage />)} />
          <Route path="my-points" element={page('my-points', <MyPointsPage />)} />
          <Route path="h2h" element={page('h2h', <H2HPage />)} />
          <Route path="rules" element={page('rules', <RulesPage />)} />
          <Route path="profile" element={page('profile', <ProfilePage />)} />
          <Route path="player/:uid" element={page('player', <PlayerPage />)} />
          <Route path="admin" element={<Guard admin><Suspense fallback={<p className="muted center">…</p>}>{page('admin', <AdminPage />)}</Suspense></Guard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
