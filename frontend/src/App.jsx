import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Upload from './pages/Upload';
import Chat from './pages/Chat';
import DocsList from './pages/DocsList';
import Sidebar from './components/Sidebar';
import { healthCheck } from './api';

function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    // Check backend connectivity on app load
    healthCheck()
      .then(() => {
        setBackendStatus('connected');
        console.log('✅ Backend connection successful');
      })
      .catch((error) => {
        setBackendStatus('error');
        console.error('❌ Backend connection failed:', error.message);
      });
  }, []);

  return (
    <Router>
      <div className="min-h-screen flex bg-gray-50">
        {/* Sidebar - Desktop */}
        <div className="hidden md:block">
          <Sidebar 
            isCollapsed={sidebarCollapsed} 
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            backendStatus={backendStatus}
          />
        </div>

        {/* Mobile Menu Button - Only show hamburger when sidebar is collapsed */}
        {sidebarCollapsed && (
          <div className="md:hidden fixed top-4 left-4 z-50">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 bg-[#E20074] text-white rounded-lg shadow-lg"
            >
              ☰
            </button>
          </div>
        )}

        {/* Mobile Sidebar */}
        {!sidebarCollapsed && (
          <div className="md:hidden fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setSidebarCollapsed(true)}></div>
            <div className="absolute left-0 top-0 h-full w-64">
              <Sidebar 
                isCollapsed={false} 
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                backendStatus={backendStatus}
              />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div 
          className={`flex-1 transition-all duration-300 min-w-0 ${
            sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
          } w-full`}
        >
        {backendStatus === 'error' && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mx-6 mt-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  <strong>Backend Connection Error:</strong> Cannot connect to the backend API at http://localhost:8000.
                  Please ensure the backend service is running.
                </p>
              </div>
            </div>
          </div>
        )}

          <main className="w-full px-6 md:px-8 py-6 md:py-8">
          <Routes>
            <Route path="/" element={<DocsList />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
        </main>
          </div>
      </div>
    </Router>
  );
}

export default App;
