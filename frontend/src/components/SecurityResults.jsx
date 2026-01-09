import React, { useState, useMemo } from 'react';
import { downloadAssessmentResults, downloadDebugLog } from '../api';

function SecurityResults({ results, assessmentId, debugEnabled }) {
  const [expandedScript, setExpandedScript] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // all, pass, fail, error, skipped
  const [searchQuery, setSearchQuery] = useState('');

  if (!results) {
    return null;
  }

  const { total, pass, fail, error, skipped } = results.results || {};
  const scripts = results.scripts || [];
  
  // Filter and search scripts
  const filteredScripts = useMemo(() => {
    return scripts.filter(script => {
      const matchesStatus = filterStatus === 'all' || script.status?.toLowerCase() === filterStatus.toLowerCase();
      const matchesSearch = !searchQuery || script.script?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [scripts, filterStatus, searchQuery]);

  const handleDownloadResults = async () => {
    try {
      await downloadAssessmentResults(assessmentId);
    } catch (err) {
      alert('Failed to download results: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDownloadDebug = async () => {
    try {
      await downloadDebugLog(assessmentId);
    } catch (err) {
      alert('Failed to download debug log: ' + (err.response?.data?.detail || err.message));
    }
  };

  const getStatusBadge = (status) => {
    const statusLower = status?.toLowerCase();
    if (statusLower === 'pass') {
      return <span className="px-3 py-1.5 bg-green-100/80 backdrop-blur-sm text-green-800 rounded-full text-sm font-semibold border border-green-200/50 shadow-sm">✓ PASS</span>;
    } else if (statusLower === 'fail') {
      return <span className="px-3 py-1.5 bg-red-100/80 backdrop-blur-sm text-red-800 rounded-full text-sm font-semibold border border-red-200/50 shadow-sm">✗ FAIL</span>;
    } else if (statusLower === 'error') {
      return <span className="px-3 py-1.5 bg-yellow-100/80 backdrop-blur-sm text-yellow-800 rounded-full text-sm font-semibold border border-yellow-200/50 shadow-sm">⚠ ERROR</span>;
    } else if (statusLower === 'skipped') {
      return <span className="px-3 py-1.5 bg-gray-100/80 backdrop-blur-sm text-gray-800 rounded-full text-sm font-semibold border border-gray-200/50 shadow-sm">⊘ SKIPPED</span>;
    }
    return <span className="px-3 py-1.5 bg-gray-100/80 backdrop-blur-sm text-gray-800 rounded-full text-sm font-semibold border border-gray-200/50 shadow-sm">{status}</span>;
  };

  return (
    <div className="mt-8 space-y-6">
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-6">
        <h3 className="text-2xl font-bold mb-6">Assessment Results</h3>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-blue-50/80 backdrop-blur-sm rounded-2xl p-4 text-center border border-blue-100/50 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="text-3xl font-bold text-blue-600">{total || 0}</div>
            <div className="text-sm text-gray-600 mt-1 font-medium">Total</div>
          </div>
          <div className="bg-green-50/80 backdrop-blur-sm rounded-2xl p-4 text-center border border-green-100/50 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="text-3xl font-bold text-green-600">{pass || 0}</div>
            <div className="text-sm text-gray-600 mt-1 font-medium">Passed</div>
          </div>
          <div className="bg-red-50/80 backdrop-blur-sm rounded-2xl p-4 text-center border border-red-100/50 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="text-3xl font-bold text-red-600">{fail || 0}</div>
            <div className="text-sm text-gray-600 mt-1 font-medium">Failed</div>
          </div>
          <div className="bg-yellow-50/80 backdrop-blur-sm rounded-2xl p-4 text-center border border-yellow-100/50 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="text-3xl font-bold text-yellow-600">{error || 0}</div>
            <div className="text-sm text-gray-600 mt-1 font-medium">Errors</div>
          </div>
          <div className="bg-gray-50/80 backdrop-blur-sm rounded-2xl p-4 text-center border border-gray-100/50 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="text-3xl font-bold text-gray-600">{skipped || 0}</div>
            <div className="text-sm text-gray-600 mt-1 font-medium">Skipped</div>
          </div>
        </div>

        {/* Download Buttons */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={handleDownloadResults}
            className="px-6 py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
          >
            Download Results (JSON)
          </button>
          {debugEnabled && (
            <button
              onClick={handleDownloadDebug}
              className="px-6 py-3 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
            >
              Download Debug Log
            </button>
          )}
        </div>

        {/* Detailed Results Section */}
        {scripts.length > 0 && (
          <div className="mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h4 className="text-lg font-semibold">Detailed Results</h4>
              
              {/* Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Search scripts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      filterStatus === 'all'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilterStatus('pass')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      filterStatus === 'pass'
                        ? 'bg-green-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Pass ({pass || 0})
                  </button>
                  <button
                    onClick={() => setFilterStatus('fail')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      filterStatus === 'fail'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Fail ({fail || 0})
                  </button>
                  <button
                    onClick={() => setFilterStatus('error')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      filterStatus === 'error'
                        ? 'bg-yellow-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Error ({error || 0})
                  </button>
                </div>
              </div>
            </div>

            {/* Scripts Grid/List */}
            <div className="space-y-3">
              {filteredScripts.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50/50 rounded-2xl">
                  No scripts match your filter criteria.
                </div>
              ) : (
                filteredScripts.map((script, index) => {
                  const originalIndex = scripts.findIndex(s => s === script);
                  const isExpanded = expandedScript === originalIndex;
                  const hasOutput = script.stderr && script.stderr.trim().length > 0;
                  
                  return (
                    <div
                      key={originalIndex}
                      className={`bg-white/60 backdrop-blur-sm rounded-2xl border-2 transition-all duration-200 hover:shadow-md ${
                        script.status?.toLowerCase() === 'pass'
                          ? 'border-green-200 hover:border-green-300'
                          : script.status?.toLowerCase() === 'fail'
                          ? 'border-red-200 hover:border-red-300'
                          : script.status?.toLowerCase() === 'error'
                          ? 'border-yellow-200 hover:border-yellow-300'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {/* Script Header */}
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => setExpandedScript(isExpanded ? null : originalIndex)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              {getStatusBadge(script.status)}
                              <span className="text-sm font-mono text-gray-900 truncate">
                                {script.script}
                              </span>
                            </div>
                            {script.returncode !== undefined && (
                              <div className="text-xs text-gray-500 ml-1">
                                Return code: {script.returncode}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedScript(isExpanded ? null : originalIndex);
                            }}
                            className="ml-4 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            {isExpanded ? '▼ Hide' : '▶ Show'} Details
                          </button>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-200 pt-4 space-y-4">
                          {hasOutput ? (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold text-red-700 flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Error Output
                                  {script.stderr.length > 1000 && (
                                    <span className="text-xs text-gray-500 font-normal">
                                      ({script.stderr.length} chars - showing first 1000)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <pre className="text-xs bg-red-50/80 backdrop-blur-sm p-4 rounded-xl border border-red-200 overflow-x-auto max-h-64 text-red-700 font-mono shadow-sm">
                                {script.stderr.length > 1000 
                                  ? script.stderr.substring(0, 1000) + '\n\n...[Truncated - download full results for complete output]'
                                  : script.stderr}
                              </pre>
                            </div>
                          ) : (
                            <div className="text-center py-4 text-gray-500 text-sm italic">
                              No error output available for this script. Check the downloaded results file for full details.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {scripts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No script results available. Check the full output in the downloaded results file.
          </div>
        )}
      </div>
    </div>
  );
}

export default SecurityResults;

