import axios from 'axios';

// Determine API URL based on environment
// In Docker: browser connects directly to backend service
// In local dev: use /api proxy (Vite handles proxying)
const getApiUrl = () => {
  // In the browser, prefer same-origin proxy to avoid CORS / network-policy issues.
  // Vite dev server will proxy /api -> backend (see vite.config.js).
  if (typeof window !== 'undefined') {
    return '/api';
  }

  // If explicitly set via env var (Docker mode), use it directly
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl;
  }

  // Default: use /api proxy for development mode
  return '/api';
};

const API_URL = getApiUrl();

console.log('API URL configured as:', API_URL);


const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

// Document APIs
export const uploadFile = async (file, metadata = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  if (metadata.document_name) formData.append('document_name', metadata.document_name);
  if (metadata.owner) formData.append('owner', metadata.owner);
  if (metadata.project) formData.append('project', metadata.project);
  if (metadata.tags) formData.append('tags', metadata.tags.join(','));
  if (typeof metadata.generate_summary !== 'undefined') {
    formData.append('generate_summary', metadata.generate_summary ? 'true' : 'false');
  }

  const response = await api.post('/ingest', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const uploadFromUrl = async (url, documentName, metadata = {}) => {
  const formData = new FormData();
  formData.append('url', url);
  if (documentName) formData.append('document_name', documentName);
  if (metadata.owner) formData.append('owner', metadata.owner);
  if (metadata.project) formData.append('project', metadata.project);
  if (metadata.tags) formData.append('tags', metadata.tags.join(','));
  if (typeof metadata.generate_summary !== 'undefined') {
    formData.append('generate_summary', metadata.generate_summary ? 'true' : 'false');
  }

  const response = await api.post('/ingest/url', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getDocuments = async () => {
  const response = await api.get('/documents');
  return response.data;
};

export const getDocument = async (docId) => {
  const response = await api.get(`/documents/${docId}`);
  return response.data;
};

// Chat APIs
export const chat = async (query, docIds = null, topK = 5, sessionId = null, options = {}) => {
  const payload = {
    query,
    top_k: topK,
    session_id: sessionId,
  };

  if (docIds && docIds.length > 0) {
    payload.doc_ids = docIds;
  }

  if (typeof options.useSystemPrompt !== 'undefined') {
    payload.use_system_prompt = options.useSystemPrompt;
  }

  if (typeof options.systemPrompt !== 'undefined') {
    payload.system_prompt = options.systemPrompt;
  }

  const response = await api.post('/chat', payload);
  return response.data;
};

export const deleteDocument = async (docId) => {
  const response = await api.delete(`/documents/${docId}`);
  return response.data;
};


export const getDocumentSummary = async (docId, refresh = false) => {
  const params = { doc_id: docId };
  if (refresh) {
    params.refresh = true;
  }
  const response = await api.get('/summary', { params });
  return response.data;
};

// Export API
export const exportDocuments = async (docIds, format = 'json') => {
  const response = await api.post('/export', {
    doc_ids: docIds,
    format,
  });
  return response.data;
};

// Health check
export const healthCheck = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    throw error;
  }
};


// Projects API
export const getProjects = async (status = null, technologyType = null) => {
  const params = {};
  if (status) params.status = status;
  if (technologyType) params.technology_type = technologyType;
  
  try {
    const response = await api.get('/projects', { params });
    // Always return an array, even if empty
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    // Enhanced error handling with detailed information
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const message = error.response.data?.detail || error.message;
      
      if (status === 400) {
        // Bad request - validation error
        throw new Error(`Invalid request: ${message}`);
      } else if (status >= 500) {
        // Server error - return empty array for graceful degradation
        console.error('Server error loading projects:', message);
        return [];
      } else {
        throw new Error(`Failed to load projects: ${message}`);
      }
    } else if (error.request) {
      // Request made but no response (network error, backend down)
      console.error('Network error: Backend not reachable');
      throw new Error('Cannot connect to backend. Please ensure the backend service is running.');
    } else {
      // Something else happened
      console.error('Error loading projects:', error.message);
      throw new Error(`Failed to load projects: ${error.message}`);
    }
  }
};

export const getProject = async (projectId) => {
  const response = await api.get(`/projects/${projectId}`);
  return response.data;
};

export const createProject = async (projectData) => {
  const response = await api.post('/projects', projectData);
  return response.data;
};

export const updateProject = async (projectId, projectData) => {
  const response = await api.put(`/projects/${projectId}`, projectData);
  return response.data;
};

export const deleteProject = async (projectId) => {
  const response = await api.delete(`/projects/${projectId}`);
  return response.data;
};

export const generateProjectSummary = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/summary`);
  return response.data;
};

export const addVulnerability = async (projectId, vulnerabilityData) => {
  const response = await api.post(`/projects/${projectId}/vulnerabilities`, vulnerabilityData);
  return response.data;
};

export const getVulnerabilities = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/vulnerabilities`);
  return response.data;
};

// Insights API
export const getInsightsByCategory = async (category) => {
  try {
    const response = await api.get(`/insights/${category}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getInsightCategories = async () => {
  const response = await api.get('/insights/categories');
  return response.data;
};

// Tools API
export const getLatestTools = async (category = null) => {
  const params = {};
  if (category) {
    params.category = category;
  }
  const response = await api.get('/tools/latest', { params });
  return response.data;
};

// Mindmaps API
export const uploadMindmap = async (file, category) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  const response = await api.post('/mindmaps/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getMindmaps = async (category) => {
  const response = await api.get(`/mindmaps/${category}`);
  return response.data;
};

export default api;

