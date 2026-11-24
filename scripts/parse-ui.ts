import { BirdApp } from '../src/ui/app.ts';
import { renderProjectsPage } from '../src/ui/projects_page.ts';
import { renderBuildingPage } from '../src/ui/building_page.ts';
import { renderGlassPage } from '../src/ui/glass_page.ts';
import { renderReflectionPage } from '../src/ui/reflection_page.ts';
import { renderRiskPage } from '../src/ui/risk_page.ts';
import { renderMeasuresPage } from '../src/ui/measures_page.ts';
import { renderSettingsPage } from '../src/ui/settings_page.ts';
import { buildReportHtml } from '../src/core/report.ts';

console.log({ BirdApp, renderProjectsPage, renderBuildingPage, renderGlassPage, renderReflectionPage, renderRiskPage, renderMeasuresPage, renderSettingsPage, buildReportHtml });
console.log('UI modules parse PASS');
