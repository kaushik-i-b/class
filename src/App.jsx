import { NavLink, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import NewCampaign from './pages/NewCampaign.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Queue from './pages/Queue.jsx';
import Settings from './pages/Settings.jsx';

const links = [
  ['/', 'Campaigns'],
  ['/queue', 'Queue'],
  ['/settings', 'Settings'],
];

export default function App() {
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <strong>Cycle</strong>
          <span>Scrape → message → follow up</span>
        </div>
        <nav className="nav">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
          <NavLink to="/campaigns/new">New campaign</NavLink>
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/campaigns/new" element={<NewCampaign />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
