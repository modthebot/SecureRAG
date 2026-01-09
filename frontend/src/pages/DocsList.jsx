import React, { useState, useEffect } from 'react';
import { getDocuments, exportDocuments, deleteDocument, getDocumentSummary } from '../api';
import DocumentCard from '../components/DocumentCard';

// Save selected document IDs to sessionStorage
const SELECTED_DOCS_KEY = 'selectedDocumentIds';

function DocsList() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [refreshingSummaryDocId, setRefreshingSummaryDocId] = useState(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const docs = await getDocuments();
      setDocuments(docs);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (docIds, format = 'json') => {
    try {
      const result = await exportDocuments(docIds, format);
      
      // Download file
      const blob = new Blob([result.content], {
        type: format === 'json' ? 'application/json' : 'text/markdown',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export.${format === 'json' ? 'json' : 'md'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (doc) => {
    const confirmDelete = window.confirm(`Delete "${doc.filename}"? This action cannot be undone.`);
    if (!confirmDelete) {
      return;
    }

    try {
      setError(null);
      setStatusMessage(null);
      setDeletingDocId(doc.doc_id);
      await deleteDocument(doc.doc_id);
      setDocuments((prev) => prev.filter((d) => d.doc_id !== doc.doc_id));
      setStatusMessage(`Deleted "${doc.filename}".`);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to delete document');
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleRefreshSummary = async (doc) => {
    try {
      setError(null);
      setStatusMessage(null);
      setRefreshingSummaryDocId(doc.doc_id);
      await getDocumentSummary(doc.doc_id, true);
      await loadDocuments();
      setStatusMessage(`Summary refreshed for "${doc.filename}".`);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to refresh summary');
    } finally {
      setRefreshingSummaryDocId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 min-h-[400px]">
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 border-4 border-[#E20074] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-gray-600 text-lg font-medium">Loading documents...</p>
        <p className="text-gray-400 text-sm mt-2">Please wait</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Documents</h2>
        <button
          onClick={() => handleExport(documents.map(d => d.doc_id), 'markdown')}
          className="bg-green-600 text-white px-6 py-3 rounded-2xl hover:bg-green-700 transition-all duration-200 shadow-lg hover:shadow-xl font-medium"
          disabled={documents.length === 0}
        >
          Export All (Markdown)
        </button>
      </div>

      {statusMessage && (
        <div className="mb-4 p-3 rounded-md bg-green-50 text-green-700 text-sm border border-green-200">
          {statusMessage}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="text-center py-12 bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20">
          <p className="text-gray-600 mb-4">No documents uploaded yet.</p>
          <a
            href="/upload"
            className="text-blue-600 hover:text-blue-800 underline font-medium"
          >
            Upload your first document
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.doc_id}
              document={doc}
              onExport={(format) => handleExport([doc.doc_id], format)}
              onDelete={() => handleDelete(doc)}
              isDeleting={deletingDocId === doc.doc_id}
              onRefreshSummary={() => handleRefreshSummary(doc)}
              isRefreshingSummary={refreshingSummaryDocId === doc.doc_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default DocsList;

