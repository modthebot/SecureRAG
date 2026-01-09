import React, { useState, useEffect } from 'react';
import { runSecurityAssessment } from '../api';
import SecurityResults from '../components/SecurityResults';
import LoadingOverlay from '../components/LoadingOverlay';

function SecurityAssessment() {
  const [url, setUrl] = useState('');
  const [flags, setFlags] = useState({
    post: '',
    jwt: '',
    cookie: ''
  });
  const [debug, setDebug] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Load form state from sessionStorage on mount
  useEffect(() => {
    try {
      const savedForm = sessionStorage.getItem('securityAssessmentForm');
      const activeAssessmentId = sessionStorage.getItem('activeAssessment');
      
      if (savedForm) {
        const { url: savedUrl, flags: savedFlags, debug: savedDebug } = JSON.parse(savedForm);
        setUrl(savedUrl || '');
        setFlags(savedFlags || { post: '', jwt: '', cookie: '' });
        setDebug(savedDebug || false);
      }
      
      if (activeAssessmentId) {
        // Poll backend for assessment status
        pollAssessmentStatus(activeAssessmentId);
      }
    } catch (error) {
      console.error('Failed to load security assessment state:', error);
    }
  }, []);

  // Save form state to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('securityAssessmentForm', JSON.stringify({
        url,
        flags,
        debug
      }));
    } catch (error) {
      console.error('Failed to save security assessment form state:', error);
    }
  }, [url, flags, debug]);

  // Save active assessment ID when loading
  useEffect(() => {
    if (results?.assessment_id && loading) {
      sessionStorage.setItem('activeAssessment', results.assessment_id);
    } else if (!loading && results) {
      // Clear active assessment when completed
      sessionStorage.removeItem('activeAssessment');
    }
  }, [results, loading]);

  // Poll assessment status function
  const pollAssessmentStatus = async (assessmentId) => {
    try {
      const { getAssessmentStatus } = await import('../api');
      const response = await getAssessmentStatus(assessmentId);
      
      if (response.status === 'completed') {
        setResults(response);
        setLoading(false);
        sessionStorage.removeItem('activeAssessment');
      } else if (response.status === 'running' || response.status === 'in_progress') {
        // Still running, poll again after 5 seconds
        setTimeout(() => pollAssessmentStatus(assessmentId), 5000);
      } else {
        // Assessment not found or failed
        sessionStorage.removeItem('activeAssessment');
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to poll assessment status:', error);
      // Stop polling on error
      sessionStorage.removeItem('activeAssessment');
      setLoading(false);
    }
  };

  // Add beforeunload handler when loading
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (loading) {
        e.preventDefault();
        e.returnValue = 'Your security assessment is in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // Prepare flags object (only include non-empty values)
      const flagsToSend = {};
      if (flags.post.trim()) flagsToSend.post = flags.post;
      if (flags.jwt.trim()) flagsToSend.jwt = flags.jwt;
      if (flags.cookie.trim()) flagsToSend.cookie = flags.cookie;

      const response = await runSecurityAssessment(url, flagsToSend, debug);
      setResults(response);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Assessment failed');
      console.error('Assessment error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {loading && (
        <LoadingOverlay
          message="Security Assessment in Progress..."
          subMessage="This may take several minutes. Please do not refresh this page."
          showTimeEstimate={true}
        />
      )}
      <h2 className="text-3xl font-bold mb-6">Security Assessment</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* URL Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target URL <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-5 py-3.5 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
            required
            disabled={loading}
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter the target URL to assess (http:// or https://)
          </p>
        </div>

        {/* Advanced Options Section */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50/50 transition-all duration-200"
            disabled={loading}
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span className="font-semibold text-gray-900">Advanced Options</span>
              {(flags.post || flags.jwt || flags.cookie) && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                  Configured
                </span>
              )}
            </div>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${showAdvanced ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Advanced Options Panel */}
          {showAdvanced && (
            <div className="px-6 pb-6 pt-2 space-y-5 border-t border-gray-200">
              {/* Authentication Section */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Authentication & Headers
                </h4>
                <div className="space-y-4 pl-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      JWT Token
                    </label>
                    <input
                      type="text"
                      value={flags.jwt}
                      onChange={(e) => setFlags({ ...flags, jwt: e.target.value })}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm transition-all duration-200 shadow-sm"
                      disabled={loading}
                    />
                    <p className="mt-1 text-xs text-gray-500">JWT token for authenticated requests</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cookie String
                    </label>
                    <input
                      type="text"
                      value={flags.cookie}
                      onChange={(e) => setFlags({ ...flags, cookie: e.target.value })}
                      placeholder="session=abc123; token=xyz789"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm transition-all duration-200 shadow-sm"
                      disabled={loading}
                    />
                    <p className="mt-1 text-xs text-gray-500">Cookie string for session-based authentication</p>
                  </div>
                </div>
              </div>

              {/* Request Body Section */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Request Body
                </h4>
                <div className="pl-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    POST Body
                  </label>
                  <textarea
                    value={flags.post}
                    onChange={(e) => setFlags({ ...flags, post: e.target.value })}
                    placeholder='{"key": "value", "data": "example"}'
                    rows={5}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm transition-all duration-200 shadow-sm"
                    disabled={loading}
                  />
                  <p className="mt-1 text-xs text-gray-500">POST request body (JSON, form data, etc.)</p>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Debug Mode Toggle */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="debug"
            checked={debug}
            onChange={(e) => setDebug(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            disabled={loading}
          />
          <label htmlFor="debug" className="ml-2 block text-sm text-gray-700">
            Enable Debug Mode (shows live output and generates debug log)
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="w-full bg-blue-600 text-white py-3.5 px-6 rounded-2xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              Running Assessment...
            </span>
          ) : (
            'Run Assessment'
          )}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div className="mt-6 p-4 bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl text-red-700 shadow-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results Display */}
      {results && (
        <SecurityResults
          results={results}
          assessmentId={results.assessment_id}
          debugEnabled={debug}
        />
      )}

    </div>
  );
}

export default SecurityAssessment;

