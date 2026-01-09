import React from 'react';
import { Link } from 'react-router-dom';

function DocumentCard({ document, onExport, onDelete, isDeleting, onRefreshSummary, isRefreshingSummary }) {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 p-6 border border-white/20 flex flex-col h-full">
      <h3 className="text-xl font-semibold mb-2 truncate">{document.filename}</h3>
      
      <div className="text-sm text-gray-600 mb-4 space-y-1">
        <p>Pages: {document.pages}</p>
        <p>Chunks: {document.chunks}</p>
        {document.metadata?.project && (
          <p>Project: {document.metadata.project}</p>
        )}
      </div>

      {document.summary ? (
        <div className="mb-4">
          <p className="text-sm text-gray-700 line-clamp-3">{document.summary.summary}</p>
          
          {document.summary.technologies && document.summary.technologies.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-600 mb-1">Technologies:</div>
              <div className="flex flex-wrap gap-1">
                {document.summary.technologies.slice(0, 5).map((tech, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                  >
                    {tech}
                  </span>
                ))}
                {document.summary.technologies.length > 5 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                    +{document.summary.technologies.length - 5}
                  </span>
                )}
              </div>
            </div>
          )}

          {onRefreshSummary && (
            <button
              type="button"
              onClick={onRefreshSummary}
              disabled={isRefreshingSummary || isDeleting}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400 transition-all duration-200"
            >
              {isRefreshingSummary && (
                <div className="w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin"></div>
              )}
              {isRefreshingSummary ? 'Refreshing summary…' : 'Regenerate summary'}
            </button>
          )}
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-xs text-gray-500 italic mb-2">
            No summary generated yet for this document.
          </p>
          {onRefreshSummary && (
            <button
              type="button"
              onClick={onRefreshSummary}
              disabled={isRefreshingSummary || isDeleting}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400 transition-all duration-200"
            >
              {isRefreshingSummary && (
                <div className="w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin"></div>
              )}
              {isRefreshingSummary ? 'Generating summary…' : 'Generate summary'}
            </button>
          )}
        </div>
      )}

      <div className="flex space-x-2 mt-auto pt-4">
        <Link
          to={`/chat?doc=${document.doc_id}`}
          className="flex-1 text-center bg-blue-600 text-white px-4 py-2.5 rounded-2xl hover:bg-blue-700 transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
        >
          Chat
        </Link>
        <button
          onClick={() => onExport('json')}
          disabled={isDeleting}
          className={`flex-1 px-4 py-2.5 rounded-2xl text-sm transition-all duration-200 font-medium shadow-sm hover:shadow-md ${
            isDeleting
              ? 'bg-green-200 text-white cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          Export
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className={`flex-1 px-4 py-2.5 rounded-2xl text-sm transition-all duration-200 font-medium shadow-sm hover:shadow-md inline-flex items-center justify-center gap-2 ${
            isDeleting
              ? 'bg-red-200 text-white cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {isDeleting && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          )}
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

DocumentCard.defaultProps = {
  onExport: () => {},
  onDelete: () => {},
  isDeleting: false,
  onRefreshSummary: null,
  isRefreshingSummary: false,
};

export default DocumentCard;

