import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  FiFileText, 
  FiUpload, 
  FiMessageCircle, 
  FiChevronLeft,
  FiChevronRight
} from 'react-icons/fi';

function Sidebar({ isCollapsed, onToggle, backendStatus }) {
  const navItems = [
    { to: '/', icon: FiFileText, label: 'Documents' },
    { to: '/upload', icon: FiUpload, label: 'Upload' },
    { to: '/chat', icon: FiMessageCircle, label: 'Chat' },
  ];

  return (
    <div 
      className={`fixed left-0 top-0 h-full bg-gradient-to-b from-[#E20074] to-[rgba(226,0,116,0.9)] text-white shadow-2xl border-r border-white/20 transition-all duration-300 z-50 overflow-visible ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
      style={{
        boxShadow: '0 0 60px rgba(226, 0, 116, 0.3), 0 0 0 1px rgba(255,255,255,0.2)'
      }}
    >
      {/* Logo and Branding */}
      <div className="px-3 pt-6 pb-4 border-b border-white/20 relative" style={{ overflow: 'visible' }}>
        <div className={`flex items-center gap-3 transition-all duration-300 ${
          isCollapsed ? 'justify-center' : ''
        }`}>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 shadow-lg flex-shrink-0">
            <span className="text-xl font-extrabold text-white tracking-tight" style={{ display: 'inline-block' }}>SR</span>
          </div>
          <div
            className={`flex-1 transition-all duration-300 ${
              isCollapsed
                ? 'max-w-0 opacity-0 overflow-hidden'
                : 'max-w-full opacity-100 overflow-visible pr-3'
            }`}
          >
            <h1 className="text-xl font-bold tracking-tight whitespace-nowrap">SecureRAG</h1>
            <div className="mt-2">
              {backendStatus === 'checking' && (
                <span className="px-2 py-1 bg-yellow-500/20 backdrop-blur-sm text-yellow-200 text-xs rounded-full border border-yellow-300/30 whitespace-nowrap">Checking...</span>
              )}
              {backendStatus === 'connected' && (
                <span className="px-2 py-1 bg-green-500/20 backdrop-blur-sm text-green-200 text-xs rounded-full border border-green-300/30 whitespace-nowrap">✓ Connected</span>
              )}
              {backendStatus === 'error' && (
                <span className="px-2 py-1 bg-red-500/20 backdrop-blur-sm text-red-200 text-xs rounded-full border border-red-300/30 whitespace-nowrap">✗ Offline</span>
              )}
            </div>
          </div>
        </div>
        {/* Toggle Button - Positioned relative to logo container, outside overflow */}
        <button
          onClick={onToggle}
          className="absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 w-8 h-8 bg-[#E20074] rounded-full border-2 border-white/30 shadow-lg flex items-center justify-center hover:bg-[rgba(226,0,116,0.9)] transition-all z-20"
          style={{ position: 'absolute' }}
        >
          {isCollapsed ? (
            <FiChevronRight className="w-5 h-5 text-white" />
          ) : (
            <FiChevronLeft className="w-5 h-5 text-white" />
          )}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="mt-6 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 mb-2 rounded-xl backdrop-blur-sm transition-all duration-200 font-medium text-sm border overflow-hidden ${
                  isActive
                    ? 'bg-white/30 border-white/40 shadow-lg text-white'
                    : 'border-white/10 hover:bg-white/20 hover:border-white/30 hover:shadow-lg text-white/90'
                }`
              }
              title={isCollapsed ? item.label : ''}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className={`transition-all duration-300 whitespace-nowrap ${
                isCollapsed ? 'max-w-0 opacity-0 overflow-hidden' : 'max-w-full opacity-100'
              }`}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>

    </div>
  );
}

export default Sidebar;

