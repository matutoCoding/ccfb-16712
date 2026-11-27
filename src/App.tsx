import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProjectsPage from './pages/ProjectsPage';
import BuildingPage from './pages/BuildingPage';
import GlassLibraryPage from './pages/GlassLibraryPage';
import ReflectionPage from './pages/ReflectionPage';
import RiskPage from './pages/RiskPage';
import MeasuresPage from './pages/MeasuresPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/building" element={<BuildingPage />} />
        <Route path="/glass" element={<GlassLibraryPage />} />
        <Route path="/reflection" element={<ReflectionPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/measures" element={<MeasuresPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<ProjectsPage />} />
      </Route>
    </Routes>
  );
}
