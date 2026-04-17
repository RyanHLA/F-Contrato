import { ReactNode, useState } from 'react';
import AdminSidebar from './AdminSidebar';

interface AdminLayoutProps {
  children: ReactNode;
  activeTab: string;
  pageTitle: string;
  pageTitleNode?: ReactNode;
  headerAction?: ReactNode;
  onTabChange: (tab: string) => void;
  onSignOut: () => void;
  accountStatus?: string | null;
  compactContent?: boolean;
}

const AdminLayout = ({ children, activeTab, pageTitle, pageTitleNode, headerAction, onTabChange, onSignOut, compactContent }: AdminLayoutProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onSignOut={onSignOut}
        isCollapsed={isCollapsed}
        onCollapsedChange={setIsCollapsed}
      />

      <div className={isCollapsed ? "ml-[88px] transition-all duration-300" : "ml-[280px] transition-all duration-300"}>
        {/* Content */}
        <main className={`px-8 pb-8 ${compactContent ? 'pt-6' : 'pt-[84px]'}`}>
          {/* Page header */}
          <div className="flex items-center justify-between mb-8">
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, letterSpacing: '-0.01em' }} className="text-[22px] text-[#1A1A1A]">{pageTitleNode ?? pageTitle}</h2>
            {headerAction && <div>{headerAction}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
