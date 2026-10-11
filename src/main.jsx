import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { LangProvider } from './contexts/LangContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { SettingsProvider } from './contexts/SettingsContext.jsx';
import { TeamsProvider } from './contexts/TeamsContext.jsx';
import { GamesProvider } from './contexts/GamesContext.jsx';
import { MyPredictionsProvider } from './contexts/MyPredictionsContext.jsx';
import { PointsProvider } from './contexts/PointsContext.jsx';
import { BonusProvider } from './contexts/BonusContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary name="root">
      <LangProvider>
        <AuthProvider>
          <SettingsProvider>
            <TeamsProvider>
              <GamesProvider>
                <MyPredictionsProvider>
                  <PointsProvider>
                    <BonusProvider>
                      <App />
                    </BonusProvider>
                  </PointsProvider>
                </MyPredictionsProvider>
              </GamesProvider>
            </TeamsProvider>
          </SettingsProvider>
        </AuthProvider>
      </LangProvider>
    </ErrorBoundary>
  </StrictMode>,
);
