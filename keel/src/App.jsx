import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import BuilderPage from './pages/BuilderPage.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';

/**
 * App shell: routing + theme only. Deliberately thin — a single component
 * carrying all chat/generation/sandbox/file-explorer state at once becomes
 * unreadable fast; here that state lives in BuilderPage and the src/lib
 * modules it composes, each unit independently readable and testable.
 */
export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('keel:theme') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('keel:theme', theme);
  }, [theme]);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />} />
          <Route path="/build" element={<BuilderPage theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
