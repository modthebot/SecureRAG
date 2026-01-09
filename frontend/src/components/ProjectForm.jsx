import React, { useState, useEffect } from 'react';
import { createProject, updateProject, generateProjectSummary, getDocuments } from '../api';
import { FiX, FiSave, FiFileText } from 'react-icons/fi';

function ProjectForm({ project, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'ongoing',
    start_date: '',
    end_date: '',
    kickoff_status: 'queued',
    technology_type: '',
    reporting_status: 'not_started',
    psm_name: '',
    functional_owner: '',
    jira_ticket_link: '',
    sharepoint_link: '',
    pinned_links: [],
    parent_doc_id: '',
    supporting_doc_ids: [],
    notes: '',
    tests_checklist: [],
    progress_percentage: 0,
    doc_id: ''
  });
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        description: project.description || '',
        status: project.status || 'ongoing',
        start_date: project.start_date ? project.start_date.split('T')[0] : '',
        end_date: project.end_date ? project.end_date.split('T')[0] : '',
        kickoff_status: project.kickoff_status || 'queued',
        technology_type: project.technology_type || '',
        reporting_status: project.reporting_status || 'not_started',
        psm_name: project.psm_name || '',
        functional_owner: project.functional_owner || '',
        jira_ticket_link: project.jira_ticket_link || '',
        sharepoint_link: project.sharepoint_link || '',
        parent_doc_id: project.parent_doc_id || '',
        supporting_doc_ids: project.supporting_doc_ids || [],
        doc_id: project.doc_id || ''
      });
    }
    loadDocuments();
  }, [project]);

  const loadDocuments = async () => {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const submitData = {
        ...formData,
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
        technology_type: formData.technology_type || null,
        doc_id: formData.doc_id || null,
        parent_doc_id: formData.parent_doc_id || null,
        supporting_doc_ids: formData.supporting_doc_ids || []
      };

      if (project) {
        await updateProject(project.id, submitData);
      } else {
        await createProject(submitData);
      }
      onClose();
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Failed to save project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!project || !formData.doc_id) {
      alert('Please select a document first and save the project.');
      return;
    }
    setGeneratingSummary(true);
    try {
      const result = await generateProjectSummary(project.id);
      alert('Summary generated successfully!');
      onClose();
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Failed to generate summary. Please try again.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">
          {project ? 'Edit Project' : 'Create New Project'}
        </h2>
        <button
          onClick={onClose}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
            >
              <option value="ongoing">Ongoing</option>
              <option value="past">Past</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kickoff Status</label>
            <select
              value={formData.kickoff_status}
              onChange={(e) => setFormData({ ...formData, kickoff_status: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
            >
              <option value="ticket_assigned">Ticket Assigned</option>
              <option value="queued">Meeting Queued</option>
              <option value="in_talks">In Talks</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Technology Type</label>
            <select
              value={formData.technology_type}
              onChange={(e) => setFormData({ ...formData, technology_type: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
            >
              <option value="">Select Technology</option>
              <option value="WEB">WEB</option>
              <option value="API">API</option>
              <option value="APK">APK</option>
              <option value="IPA">IPA</option>
              <option value="THICK">THICK</option>
              <option value="AI">AI</option>
              <option value="AWS">AWS</option>
              <option value="GCP">GCP</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PSM Name</label>
            <input
              type="text"
              value={formData.psm_name}
              onChange={(e) => setFormData({ ...formData, psm_name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Functional Owner</label>
            <input
              type="text"
              value={formData.functional_owner}
              onChange={(e) => setFormData({ ...formData, functional_owner: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jira Ticket Link</label>
            <input
              type="url"
              value={formData.jira_ticket_link}
              onChange={(e) => setFormData({ ...formData, jira_ticket_link: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SharePoint Link</label>
            <input
              type="url"
              value={formData.sharepoint_link}
              onChange={(e) => setFormData({ ...formData, sharepoint_link: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
              placeholder="https://..."
            />
          </div>

        {/* Main Technical Doc */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Main Technical Doc</label>
          <select
            value={formData.parent_doc_id}
            onChange={(e) => setFormData({ ...formData, parent_doc_id: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
          >
            <option value="">Select Document</option>
            {documents.map((doc) => (
              <option key={doc.doc_id} value={doc.doc_id}>
                {doc.filename}
              </option>
            ))}
          </select>
        </div>

        {/* Supporting Docs */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Supporting Documents</label>
          <div className="space-y-2 max-h-44 overflow-y-auto border border-gray-200 rounded-lg p-3">
            {documents.map((doc) => {
              const checked = formData.supporting_doc_ids.includes(doc.doc_id);
              return (
                <label key={doc.doc_id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          supporting_doc_ids: [...formData.supporting_doc_ids, doc.doc_id],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          supporting_doc_ids: formData.supporting_doc_ids.filter((id) => id !== doc.doc_id),
                        });
                      }
                    }}
                  />
                  <span className="truncate">{doc.filename}</span>
                </label>
              );
            })}
            {documents.length === 0 && <div className="text-xs text-gray-500">No documents available.</div>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Associated Document (legacy)</label>
          <select
            value={formData.doc_id}
            onChange={(e) => setFormData({ ...formData, doc_id: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
          >
            <option value="">Select Document</option>
            {documents.map((doc) => (
              <option key={doc.doc_id} value={doc.doc_id}>
                {doc.filename}
              </option>
            ))}
          </select>
        </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E20074] focus:border-transparent"
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div>
            {project && formData.doc_id && (
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={generatingSummary}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <FiFileText className="w-4 h-4" />
                {generatingSummary ? 'Generating...' : 'Generate Summary'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#E20074] text-white rounded-lg hover:bg-[rgba(226,0,116,0.9)] transition-colors disabled:opacity-50"
            >
              <FiSave className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save Project'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ProjectForm;

