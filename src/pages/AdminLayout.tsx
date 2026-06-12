import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Calendar, Send, LogOut, Clock, FileText, History, Settings, Bug } from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { StaffManagement } from './StaffManagement';
import { WeeklyReports } from './WeeklyReports';
import { Invitations } from './Invitations';
import { TimeLogs } from './TimeLogs';
import { AuditLog } from './AuditLog';
import { AdminSettings } from './AdminSettings';
import { BugReports } from './BugReports';
import { BrandDots } from '../components/BrandAccents';

interface AdminLayoutProps {
  onSignOut: () => void;
  initialTab?: string;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'logs', label: 'Time Logs', icon: FileText },
  { id: 'reports', label: 'Reports', icon: Calendar },
  { id: 'invitations', label: 'Invitations', icon: Send },
  { id: 'audit', label: 'Audit Log', icon: History },
  { id: 'bugs', label: 'Bugs', icon: Bug },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AdminLayout({ onSignOut, initialTab = 'dashboard' }: AdminLayoutProps) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-4 text-sm font-bold border-b-3 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-moja-aqua text-moja-blue'
                    : 'border-transparent text-moja-blue/40 hover:text-moja-blue hover:border-moja-blue/20'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'staff' && <StaffManagement />}
        {activeTab === 'logs' && <TimeLogs />}
        {activeTab === 'reports' && <WeeklyReports />}
        {activeTab === 'invitations' && <Invitations />}
        {activeTab === 'audit' && <AuditLog />}
        {activeTab === 'bugs' && <BugReports />}
        {activeTab === 'settings' && <AdminSettings />}
      </main>
    </div>
  );
}
