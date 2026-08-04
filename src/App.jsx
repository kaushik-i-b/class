import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import AccountDetail from './pages/AccountDetail.jsx';
import Campaigns from './pages/Campaigns.jsx';
import Sprints from './pages/Sprints.jsx';
import Settings from './pages/Settings.jsx';

const links = [
  ['/', 'Dashboard'],
  ['/accounts', 'Accounts'],
  ['/campaigns', 'Campaigns'],
  ['/sprints', 'Sprints'],
  ['/settings', 'Settings'],
];

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <strong>Cycle</strong>
          <span>GTM Engineering OS</span>
        </div>
        <nav className="nav">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          Enrichment before automation. Score before triggers. Measure every two weeks.
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/:id" element={<AccountDetail />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/sprints" element={<Sprints />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
