import React, { useState, useEffect, useMemo } from 'react';
import { getLatestTools } from '../api';
import { FiExternalLink, FiStar, FiRefreshCw, FiCode } from 'react-icons/fi';
import { format } from 'date-fns';

// Categories for Latest Tools (excluding FutureTools)
const TOOL_CATEGORIES = [
  { id: null, label: 'All', icon: '🔧' },
  { id: 'AWS', label: 'AWS', icon: '☁️' },
  { id: 'GCP', label: 'GCP', icon: '☁️' },
  { id: 'AI', label: 'AI', icon: '🤖' },
  { id: 'LLM', label: 'LLM', icon: '🧠' },
  { id: 'WEB', label: 'WEB', icon: '🌐' },
  { id: 'APK', label: 'APK', icon: '📱' },
  { id: 'IPA', label: 'IPA', icon: '📱' },
  { id: 'API', label: 'API', icon: '🔌' },
  { id: 'THICK', label: 'THICK', icon: '💻' },
  { id: 'OTC', label: 'OTC', icon: '🔒' },
];

function LatestTools() {
  const [toolsByCategory, setToolsByCategory] = useState({});
  const [loadingMap, setLoadingMap] = useState({});
  const [errors, setErrors] = useState({});
  const [lastUpdateMap, setLastUpdateMap] = useState({});
  const [activeCategory, setActiveCategory] = useState(null);

  const isActiveLoading = loadingMap[activeCategory ?? 'all'] ?? false;
  const activeKey = activeCategory ?? 'all';
  const activeTools = useMemo(
    () => toolsByCategory[activeKey]?.tools || [],
    [toolsByCategory, activeKey]
  );

  useEffect(() => {
    let cancelled = false;

    const fetchCategory = async (categoryId, force = false) => {
      const key = categoryId ?? 'all';
      if (!force && toolsByCategory[key]) return;
      setLoadingMap((prev) => ({ ...prev, [key]: true }));
      setErrors((prev) => ({ ...prev, [key]: null }));
      try {
        const data = await getLatestTools(categoryId);
        if (cancelled) return;
        setToolsByCategory((prev) => ({ ...prev, [key]: data || { tools: [] } }));
        setLastUpdateMap((prev) => ({ ...prev, [key]: new Date() }));
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading tools:', error);
        setErrors((prev) => ({ ...prev, [key]: 'Failed to load tools' }));
        setToolsByCategory((prev) => ({ ...prev, [key]: { tools: [] } }));
      } finally {
        if (cancelled) return;
        setLoadingMap((prev) => ({ ...prev, [key]: false }));
      }
    };

    const prefetchAll = async () => {
      await Promise.all(
        TOOL_CATEGORIES.map((category) => fetchCategory(category.id, true))
      );
    };

    prefetchAll();

    return () => {
      cancelled = true;
    };
  }, []); // prefetch all categories on first load

  const handleRefresh = () => {
    const key = activeCategory ?? 'all';
    const fetchLatest = async () => {
      setLoadingMap((prev) => ({ ...prev, [key]: true }));
      setErrors((prev) => ({ ...prev, [key]: null }));
      try {
        const data = await getLatestTools(activeCategory);
        setToolsByCategory((prev) => ({ ...prev, [key]: data || { tools: [] } }));
        setLastUpdateMap((prev) => ({ ...prev, [key]: new Date() }));
      } catch (error) {
        console.error('Error refreshing tools:', error);
        setErrors((prev) => ({ ...prev, [key]: 'Failed to refresh tools' }));
      } finally {
        setLoadingMap((prev) => ({ ...prev, [key]: false }));
      }
    };
    fetchLatest();
  };

  if (isActiveLoading && activeTools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 min-h-[300px]">
        <div className="relative w-12 h-12 mb-4">
          <div className="absolute inset-0 border-4 border-[#E20074] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-gray-600">Loading latest tools...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Category Filters */}
      <div className="mb-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {TOOL_CATEGORIES.map(category => (
            <button
              key={category.id || 'all'}
              onClick={() => setActiveCategory(category.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeCategory === category.id
                  ? 'bg-[#E20074] text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span>{category.icon}</span>
              <span>{category.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          {lastUpdateMap[activeKey] && `Last updated: ${lastUpdateMap[activeKey].toLocaleTimeString()}`}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isActiveLoading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${isActiveLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tools Grid */}
      {isActiveLoading && activeTools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 min-h-[300px]">
          <div className="relative w-12 h-12 mb-4">
            <div className="absolute inset-0 border-4 border-[#E20074] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600">Loading {TOOL_CATEGORIES.find(c => c.id === activeCategory)?.label || 'All'} tools...</p>
        </div>
      ) : activeTools.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No tools found. Try refreshing or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeTools.map((tool, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 mb-1">{tool.name}</h3>
                  <p className="text-sm text-gray-500 mb-2">{tool.full_name}</p>
                </div>
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#E20074] hover:text-[rgba(226,0,116,0.9)] flex-shrink-0"
                >
                  <FiExternalLink className="w-5 h-5" />
                </a>
              </div>

              {tool.description && (
                <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                  {tool.description}
                </p>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <FiStar className="w-4 h-4 text-yellow-500" />
                    <span>{tool.stars.toLocaleString()}</span>
                  </div>
                  {tool.language && (
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <FiCode className="w-4 h-4" />
                      <span>{tool.language}</span>
                    </div>
                  )}
                </div>
                {tool.updated_at && (
                  <span className="text-xs text-gray-500">
                    {format(new Date(tool.updated_at), 'MMM dd, yyyy')}
                  </span>
                )}
              </div>

              {tool.topics && tool.topics.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex flex-wrap gap-1">
                    {tool.topics.slice(0, 5).map((topic, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LatestTools;

