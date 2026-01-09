import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { chat, getDocuments, getProject } from '../api';
import LoadingOverlay from '../components/LoadingOverlay';

function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [useSystemPrompt, setUseSystemPrompt] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chatHistory');
      if (saved) {
        const { messages, selectedDocIds, useSystemPrompt: savedUseSystemPrompt, customPrompt: savedCustomPrompt, timestamp } = JSON.parse(saved);
        // Only restore if less than 24 hours old
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          if (messages && messages.length > 0) {
            setMessages(messages);
          }
          if (selectedDocIds && selectedDocIds.length > 0) {
            setSelectedDocIds(selectedDocIds);
          }
          if (savedUseSystemPrompt !== undefined) {
            setUseSystemPrompt(savedUseSystemPrompt);
          }
          if (savedCustomPrompt !== undefined) {
            setCustomPrompt(savedCustomPrompt);
          }
        } else {
          // Clear old history
          localStorage.removeItem('chatHistory');
        }
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  }, []);

  // Save chat history to localStorage
  useEffect(() => {
    if (messages.length > 0 || selectedDocIds.length > 0) {
      try {
        const chatHistory = {
          messages,
          selectedDocIds,
          useSystemPrompt,
          customPrompt,
          timestamp: Date.now()
        };
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
      } catch (error) {
        console.error('Failed to save chat history:', error);
      }
    }
  }, [messages, selectedDocIds, useSystemPrompt, customPrompt]);


  useEffect(() => {
    loadDocuments();
  }, []);

  // Add beforeunload handler when loading
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (loading) {
        e.preventDefault();
        e.returnValue = 'Your chat response is being generated. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [loading]);

  // Load project if projectId query exists and docs ready
  useEffect(() => {
    const projectId = searchParams.get('projectId');
    if (!projectId || documents.length === 0) return;
    if (activeProjectId === projectId) return;

    const fetchProject = async () => {
      try {
        const proj = await getProject(projectId);
        setActiveProjectId(projectId);
        setActiveProject(proj);
        const docIds = [
          proj.parent_doc_id,
          ...(proj.supporting_doc_ids || []),
        ].filter(Boolean);
        if (docIds.length > 0) {
          setSelectedDocIds(Array.from(new Set(docIds)));
        }
      } catch (err) {
        console.error('Failed to load project for chat:', err);
      }
    };
    fetchProject();
  }, [searchParams, documents, activeProjectId]);

  // Auto-select document from URL parameter
  useEffect(() => {
    const docIdFromUrl = searchParams.get('doc');
    if (docIdFromUrl && documents.length > 0) {
      // Check if document exists and is not already selected
      const docExists = documents.some(doc => doc.doc_id === docIdFromUrl);
      if (docExists && !selectedDocIds.includes(docIdFromUrl)) {
        setSelectedDocIds([docIdFromUrl]);
        // Clear URL parameter after selection
        setSearchParams({});
      }
    }
  }, [documents, searchParams, setSearchParams, selectedDocIds]);

  useEffect(() => {
    if (messages.length === 0) return;

    const frame = requestAnimationFrame(() => {
      if (messagesContainerRef.current && messagesEndRef.current) {
        // Scroll only the chat panel container, not the entire page
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [messages]);

  const loadDocuments = async () => {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const response = await chat(
        query,
        selectedDocIds.length > 0 ? selectedDocIds : null,
        5,
        sessionId,
        {
          useSystemPrompt,
          systemPrompt: useSystemPrompt && customPrompt.trim() ? customPrompt.trim() : undefined,
        }
      );

      const assistantMessage = {
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        answerType: response.answer_type,
        confidence: response.confidence,
        usedSystemPrompt: response.used_system_prompt,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = {
        role: 'assistant',
        content: 'Error: ' + (err.response?.data?.detail || err.message || 'Failed to get response'),
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const parentDoc =
    activeProject?.parent_doc_id &&
    documents.find((d) => d.doc_id === activeProject.parent_doc_id);

  // Logic from reference: only show summary when exactly one document is selected
  const singleSelectedDocId =
    selectedDocIds.length === 1 ? selectedDocIds[0] : null;
  const singleSelectedDoc = singleSelectedDocId
    ? documents.find((d) => d.doc_id === singleSelectedDocId)
    : null;
  const hasSummary =
    singleSelectedDoc &&
    singleSelectedDoc.summary &&
    singleSelectedDoc.summary.summary &&
    singleSelectedDoc.summary.summary.trim().length > 0;

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
      setMessages([]);
      setSelectedDocIds([]);
      setCustomPrompt('');
      localStorage.removeItem('chatHistory');
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {loading && (
        <LoadingOverlay
          message="Generating response..."
          subMessage="Please do not refresh this page while your response is being generated."
          showTimeEstimate={true}
        />
      )}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Chat with Documents</h2>
        {messages.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            Clear History
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main chat area */}
        <div className="lg:col-span-2">
          {/* Document selector */}
          <div className="mb-4 p-6 bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Filter by Documents (leave empty for all):
            </label>
            <div 
              className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${
                documents.length > 5 ? 'max-h-[400px] overflow-y-auto pr-2' : ''
              }`}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e0 #f7fafc'
              }}
            >
              {documents.map((doc) => {
                const isSelected = selectedDocIds.includes(doc.doc_id);
                return (
                  <button
                    key={doc.doc_id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDocIds(selectedDocIds.filter((id) => id !== doc.doc_id));
                      } else {
                        setSelectedDocIds([...selectedDocIds, doc.doc_id]);
                      }
                    }}
                    className={`relative p-4 rounded-2xl border-2 transition-shadow duration-200 text-left hover:shadow-md ${
                      isSelected
                        ? 'bg-blue-50/80 backdrop-blur-sm border-blue-500 shadow-md'
                        : 'bg-white/60 backdrop-blur-sm border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Checkmark icon for selected state */}
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <svg
                          className="w-5 h-5 text-blue-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="pr-6">
                      <div className={`font-medium text-sm mb-1 truncate ${
                        isSelected ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {doc.filename}
                      </div>
                      {doc.summary && (
                        <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                          {doc.summary.summary.substring(0, 60)}...
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-600 mt-2">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {doc.pages} pages
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          {doc.chunks} chunks
                        </span>
                        {doc.summary && (
                          <span className="flex items-center gap-1 text-green-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Summary
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <input
                  type="checkbox"
                  checked={useSystemPrompt}
                  onChange={(e) => setUseSystemPrompt(e.target.checked)}
                  className="rounded"
                />
                <span>Use security-focused system prompt</span>
              </label>
              {useSystemPrompt ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    The system prompt guides the assistant to respond with penetration-testing insights.
                    Customize it below or leave blank to use the default.
                  </p>
                  <textarea
                    rows={3}
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Optional: Provide a custom system prompt..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all duration-200"
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  System prompt disabled. The assistant will answer in general mode.
                </p>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-6 mb-4 h-96 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>Start a conversation by asking a question about your documents.</p>
                <p className="text-sm mt-2">Try: "Give me a summary of the architecture"</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-blue-50/80 backdrop-blur-sm ml-12 border border-blue-100/50'
                        : msg.error
                        ? 'bg-red-50/80 backdrop-blur-sm mr-12 border border-red-100/50'
                        : 'bg-gray-50/80 backdrop-blur-sm mr-12 border border-gray-100/50'
                    }`}
                  >
                    <div className="font-semibold mb-1">
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-xs font-semibold text-gray-600 mb-1">Sources:</div>
                        {msg.sources.map((source, sidx) => (
                          <div key={sidx} className="text-xs text-gray-600 mb-1">
                            • {source.filename} (Page {source.page}, Chunk {source.chunk_id})
                            {source.score && (
                              <span className="text-gray-400 ml-2">
                                (Score: {source.score.toFixed(2)})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.confidence && (
                      <div className="mt-2 text-xs text-gray-500">
                        Confidence: {(msg.confidence * 100).toFixed(1)}%
                      </div>
                    )}
                    {typeof msg.usedSystemPrompt === 'boolean' && (
                      <div className="mt-1 text-xs text-gray-400">
                        System prompt: {msg.usedSystemPrompt ? 'On' : 'Off'}
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="p-4 bg-gray-50 rounded-lg mr-12">
                    <div className="font-semibold mb-1">Assistant</div>
                    <div className="text-gray-600">Thinking...</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="flex space-x-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your documents..."
              className="flex-1 px-5 py-3.5 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-base shadow-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-blue-600 text-white px-8 py-3.5 rounded-2xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
            >
              Send
            </button>
          </form>
        </div>

        {/* Summary Panel (only when a single document with a summary is selected) */}
        <div className="lg:col-span-1 space-y-4">
          {selectedDocIds.length === 0 && (
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-6 text-sm text-gray-600">
              Select a document to view its summary.
            </div>
          )}

          {selectedDocIds.length > 1 && (
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-6 text-sm text-gray-600">
              Summary is available when exactly one document is selected.
            </div>
          )}

          {singleSelectedDocId && !hasSummary && (
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-6 text-sm text-gray-600">
              No summary available for this document yet. Summary will be shown once available.
            </div>
          )}

          {singleSelectedDocId && hasSummary && (
            <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 p-6 space-y-4 transform hover:scale-[1.01] transition-all duration-300" style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.5)'
            }}>
              <div>
                <h3 className="text-xl font-semibold mb-2">Application Snapshot</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">
                  {singleSelectedDoc.summary.summary}
                </p>
                {singleSelectedDoc.summary.technologies && singleSelectedDoc.summary.technologies.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-600 mb-1">Technologies:</div>
                    <div className="flex flex-wrap gap-1">
                      {singleSelectedDoc.summary.technologies.slice(0, 10).map((tech, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                        >
                          {tech}
                        </span>
                      ))}
                      {singleSelectedDoc.summary.technologies.length > 10 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          +{singleSelectedDoc.summary.technologies.length - 10}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {singleSelectedDoc.summary.focus_areas && singleSelectedDoc.summary.focus_areas.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-600 mb-1">Focus Areas:</div>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-700">
                      {singleSelectedDoc.summary.focus_areas.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {singleSelectedDoc.summary.use_cases && singleSelectedDoc.summary.use_cases.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-600 mb-1">Use Cases:</div>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-700">
                      {singleSelectedDoc.summary.use_cases.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Chat;

