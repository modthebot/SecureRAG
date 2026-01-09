import React, { useState, useEffect } from 'react';
import { getLatestTools } from '../api';
import { FiExternalLink, FiStar, FiRefreshCw, FiCode } from 'react-icons/fi';
import { format } from 'date-fns';

function LatestTools() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    setLoading(true);
    try {
      const data = await getLatestTools();
      setTools(data.tools || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading tools:', error);
      alert('Failed to load tools');
    } finally {
      setLoading(false);
    }
  };

  if (loading && tools.length === 0) {
    return <div className="max-w-7xl mx-auto text-center py-8">Loading latest tools...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Latest Penetration Testing Tools</h1>
            <p className="text-gray-600">Discover the latest tools from GitHub</p>
          </div>
          <button
            onClick={loadTools}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {lastUpdate && (
          <p className="text-sm text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Tools Grid */}
      {tools.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No tools found. Try refreshing or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool, index) => (
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

