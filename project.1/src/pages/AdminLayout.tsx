import { useState } from 'react';
import { LayoutDashboard, Users, Calendar, Send, LogOut, Clock } from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { StaffManagement } from './StaffManagement';
import { WeeklyReports } from './WeeklyReports';
import { Invitations } from './Invitations';
import { BrandDots } from '../components/BrandAccents';

interface AdminLayoutProps {
  onSignOut: () => void;
  initialTab?: string;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'staff', label: 'Staff Management', icon: Users },
  { id: 'reports', label: 'Weekly Reports', icon: Calendar },
  { id: 'invitations', label: 'Invitations', icon: Send },
];

export function AdminLayout({ onSignOut, initialTab = 'dashboard' }: AdminLayoutProps) {
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="min-h-screen bg-moja-bg">
      {/* Header */}
      <header className="bg-white border-b-4 border-moja-orange px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-moja-blue flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-moja-blue">Moja Behavioral Services</h1>
              <BrandDots className="mt-0.5" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href="#/" className="text-sm text-moja-blue/50 hover:text-moja-aqua transition-colors font-semibold">
              View Time Clock
            </a>
            <button
              onClick={onSignOut}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-moja-blue/60 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-5 py-4 text-sm font-bold border-b-3 transition-all ${
                  activeTab === tab.id
                    ? 'border-moja-aqua text-moja-blue'
                    : 'border-transparent text-moja-blue/40 hover:text-moja-blue hover:border-moja-blue/20'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'staff' && <StaffManagement />}
        {activeTab === 'reports' && <WeeklyReports />}
        {activeTab === 'invitations' && <Invitations />}
      </main>
    </div>
  );
}
