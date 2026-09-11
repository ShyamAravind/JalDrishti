import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import MapPage from './pages/MapPage';
import SpatialAnalysis from './pages/SpatialAnalysis';
import WhatIfSimulator from './pages/WhatIfSimulator';
import ImpactSimulation from './pages/ImpactSimulation';
import AlertsPage from './pages/Alerts';
import ReportsPage from './pages/Reports';
import ProjectDetailPage from './pages/ProjectDetail';
import GeoImageIntel from './pages/GeoImageIntel';
import InterventionAssessmentPage from './pages/InterventionAssessment';
import Login from './pages/Login';
import Chatbot from './components/Chatbot';
import { useAuthStore } from './store/authStore';
import { useFilterStore } from './store/filterStore';

const App: React.FC = () => {
  const officer = useAuthStore(s => s.officer);

  // Keep the shared filter store's district in sync with the logged-in
  // officer — runs on every officer change AND on initial mount, so a
  // browser refresh (which rehydrates `officer` from sessionStorage but
  // doesn't re-run login()) still correctly re-applies district scoping.
  useEffect(() => {
    if (officer) {
      useFilterStore.getState().setDistrict(officer.isAdmin ? '' : officer.district);
    }
  }, [officer]);

  // Route gate: no authenticated officer session -> show Login.
  // Login is now backend-authenticated (bcrypt + JWT, see authStore.ts) —
  // there is no silent unauthenticated fallback.
  if (!officer) {
    return <Login />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-surface flex flex-col font-sans text-text-dark">
        {/* Top Navbar */}
        <Navbar />

        {/* Page Content */}
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/analysis" element={<SpatialAnalysis />} />
            <Route path="/simulator" element={<WhatIfSimulator />} />
            <Route path="/simulation" element={<ImpactSimulation />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/project/:id" element={<ProjectDetailPage />} />
            <Route path="/geo-intel" element={<GeoImageIntel />} />
            <Route path="/interventions" element={<InterventionAssessmentPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
        <Chatbot />
      </div>
    </Router>
  );
};

export default App;
