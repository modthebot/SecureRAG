import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFile, uploadFromUrl } from '../api';
import LoadingOverlay from '../components/LoadingOverlay';

function Upload() {
  const [uploadMode, setUploadMode] = useState('file'); // 'file' or 'url'
  const [file, setFile] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [fileDocumentName, setFileDocumentName] = useState(''); // For file upload
  const [urlDocumentName, setUrlDocumentName] = useState(''); // For URL upload
  const [metadata, setMetadata] = useState({ owner: '', project: '', tags: '' });
  const [generateSummary, setGenerateSummary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Add beforeunload handler when uploading
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (uploading) {
        e.preventDefault();
        e.returnValue = 'Your document is being uploaded and processed. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [uploading]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
        setError(null);
      }
    },
    multiple: false,
  });

  const handleFileSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const tags = metadata.tags.split(',').map(t => t.trim()).filter(t => t);
      const response = await uploadFile(file, {
        document_name: fileDocumentName.trim() || undefined,
        owner: metadata.owner || undefined,
        project: metadata.project || undefined,
        tags: tags.length > 0 ? tags : undefined,
        generate_summary: generateSummary,
      });
      setResult(response);
      setFile(null);
      setFileDocumentName('');
      setMetadata({ owner: '', project: '', tags: '' });
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    if (!urlInput.trim()) {
      setError('Please enter a URL');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const tags = metadata.tags.split(',').map(t => t.trim()).filter(t => t);
      const response = await uploadFromUrl(urlInput.trim(), urlDocumentName.trim() || undefined, {
        owner: metadata.owner || undefined,
        project: metadata.project || undefined,
        tags: tags.length > 0 ? tags : undefined,
        generate_summary: generateSummary,
      });
      setResult(response);
      setUrlInput('');
      setUrlDocumentName('');
      setMetadata({ owner: '', project: '', tags: '' });
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'URL upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {uploading && (
        <LoadingOverlay
          message="Uploading and Processing Document..."
          subMessage="Please do not refresh this page while your document is being processed."
          showTimeEstimate={true}
        />
      )}
      <h2 className="text-3xl font-bold mb-6">Upload Document</h2>

      {/* Upload Mode Tabs */}
      <div className="flex space-x-2 mb-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => {
            setUploadMode('file');
            setError(null);
            setResult(null);
            setFileDocumentName('');
          }}
          className={`px-6 py-3 font-medium transition-all duration-200 ${
            uploadMode === 'file'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload File
        </button>
        <button
          type="button"
          onClick={() => {
            setUploadMode('url');
            setError(null);
            setResult(null);
            setUrlDocumentName('');
          }}
          className={`px-6 py-3 font-medium transition-all duration-200 ${
            uploadMode === 'url'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload from URL
        </button>
      </div>

      {uploadMode === 'file' ? (
        <form onSubmit={handleFileSubmit} className="space-y-6">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 ${
            isDragActive ? 'border-blue-500 bg-blue-50/80 backdrop-blur-sm shadow-lg' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50/50'
          }`}
        >
          <input {...getInputProps()} />
          {file ? (
            <div>
              <p className="text-lg font-semibold">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <div>
              <p className="text-lg">Drag & drop a file here, or click to select</p>
              <p className="text-sm text-gray-500 mt-2">PDF, DOCX, PNG, or JPG</p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Document Name (optional)
          </label>
          <input
            type="text"
            value={fileDocumentName}
            onChange={(e) => setFileDocumentName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
            placeholder="Leave empty to use filename"
          />
          <p className="text-xs text-gray-500 mt-1">If not provided, the filename will be used</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Owner (optional)
            </label>
            <input
              type="text"
              value={metadata.owner}
              onChange={(e) => setMetadata({ ...metadata, owner: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project (optional)
            </label>
            <input
              type="text"
              value={metadata.project}
              onChange={(e) => setMetadata({ ...metadata, project: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
              placeholder="Project name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags (optional)
            </label>
            <input
              type="text"
              value={metadata.tags}
              onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
              placeholder="tag1, tag2, tag3"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 mt-2">
          <label className="inline-flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={generateSummary}
              onChange={(e) => setGenerateSummary(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span>
              <span className="font-medium">Generate security-focused summary on upload</span>
              <span className="block text-xs text-gray-500">
                When disabled, the document will still be indexed for search, but no summary is created.
                You can generate one later from the Documents page.
              </span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full bg-blue-600 text-white py-3.5 px-6 rounded-2xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
        >
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
      </form>
      ) : (
        <form onSubmit={handleUrlSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                placeholder="https://example.com/page"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Name (optional)
              </label>
              <input
                type="text"
                value={urlDocumentName}
                onChange={(e) => setUrlDocumentName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                placeholder="Leave empty to use page title"
              />
              <p className="text-xs text-gray-500 mt-1">If not provided, the page title will be extracted automatically</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Owner (optional)
              </label>
              <input
                type="text"
                value={metadata.owner}
                onChange={(e) => setMetadata({ ...metadata, owner: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project (optional)
              </label>
              <input
                type="text"
                value={metadata.project}
                onChange={(e) => setMetadata({ ...metadata, project: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                placeholder="Project name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags (optional)
              </label>
              <input
                type="text"
                value={metadata.tags}
                onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </div>

        <div className="border-t border-gray-200 pt-4 mt-2">
          <label className="inline-flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={generateSummary}
              onChange={(e) => setGenerateSummary(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span>
              <span className="font-medium">Generate security-focused summary on upload</span>
              <span className="block text-xs text-gray-500">
                Turn this off for non-security content or general RAG; you can always generate a summary later from the Documents page.
              </span>
            </span>
          </label>
        </div>

          <button
            type="submit"
            disabled={!urlInput.trim() || uploading}
            className="w-full bg-blue-600 text-white py-3.5 px-6 rounded-2xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
          >
            {uploading ? 'Processing URL...' : 'Process URL'}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 p-6 bg-green-50/80 backdrop-blur-sm border border-green-200 rounded-3xl shadow-lg">
          <h3 className="text-lg font-semibold text-green-800 mb-2">Upload Successful!</h3>
          <p className="text-sm text-green-700 mb-4">
            Document ID: <code className="bg-green-100 px-2 py-1 rounded">{result.doc_id}</code>
          </p>
          <p className="text-sm text-green-700 mb-2">
            Pages: {result.pages} | Chunks: {result.chunks}
          </p>
          {result.summary && generateSummary && (
            <div className="mt-4">
              <h4 className="font-semibold text-green-800 mb-2">Summary:</h4>
              <p className="text-sm text-green-700 mb-2">{result.summary.summary}</p>
              {result.summary.technologies && result.summary.technologies.length > 0 && (
                <div className="mt-2">
                  <span className="font-semibold text-green-800">Technologies: </span>
                  <span className="text-sm text-green-700">
                    {result.summary.technologies.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Upload;

