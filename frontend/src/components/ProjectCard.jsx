import React from 'react';
import { format, eachDayOfInterval, isWeekend } from 'date-fns';
import { FiEdit, FiTrash2, FiExternalLink, FiCalendar, FiUser, FiMessageCircle, FiLink2, FiFileText, FiClock } from 'react-icons/fi';
import { Link } from 'react-router-dom';

// Helper function to calculate business days (excluding weekends)
const calculateBusinessDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Normalize dates to start of day to avoid timezone issues
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  if (start > end) return 0;
  
  // Get all days in the interval (inclusive of both start and end)
  const days = eachDayOfInterval({ start, end });
  
  // Filter out weekends (Saturday = 6, Sunday = 0)
  const businessDays = days.filter(day => !isWeekend(day));
  
  return businessDays.length;
};

function ProjectCard({ project, onEdit, onDelete }) {
  const getStatusColor = (status) => {
    return status === 'ongoing' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  const getReportingStatusColor = (status) => {
    const colors = {
      not_started: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-blue-100 text-blue-800'
    };
    return colors[status] || colors.not_started;
  };

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden relative">
      {/* Decorative accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E20074] via-purple-500 to-blue-500"></div>
      
      {/* Header with title and actions */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-xl font-bold text-gray-900 pr-4">{project.name}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(project)}
            className="p-2 text-gray-500 hover:text-[#E20074] hover:bg-pink-50 rounded-lg transition-all duration-200"
            title="Edit project"
          >
            <FiEdit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(project.id)}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
            title="Delete project"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top Quick Info: Start Date, PSM, End Date, Owner, Links, Chat - Highlighted Section */}
      <div className="mb-5 p-4 bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-purple-50/80 backdrop-blur-sm rounded-2xl border-2 border-blue-200/50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          {project.start_date && (
            <div className="group flex items-center gap-3 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl border-2 border-blue-300 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <FiCalendar className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Start</span>
                <span className="text-sm font-bold text-gray-900">
                  {format(new Date(project.start_date), 'MMM dd, yyyy')}
                </span>
              </div>
            </div>
          )}
          
          {project.psm_name && (
            <div className="group flex items-center gap-3 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl border-2 border-emerald-300 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <FiUser className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">PSM</span>
                <span className="text-sm font-bold text-gray-900">{project.psm_name}</span>
              </div>
            </div>
          )}

          {project.end_date && (
            <div className="group flex items-center gap-3 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl border-2 border-purple-300 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <FiCalendar className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">End</span>
                <span className="text-sm font-bold text-gray-900">
                  {format(new Date(project.end_date), 'MMM dd, yyyy')}
                </span>
              </div>
            </div>
          )}

          {project.functional_owner && (
            <div className="group flex items-center gap-3 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl border-2 border-amber-300 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <FiUser className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Owner</span>
                <span className="text-sm font-bold text-gray-900">{project.functional_owner}</span>
              </div>
            </div>
          )}

          {/* Business Days Worked - for completed projects */}
          {project.status === 'past' && project.business_days_worked && project.business_days_worked > 0 && (
            <div className="group flex items-center gap-3 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl border-2 border-green-300 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <FiClock className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Business Days</span>
                <span className="text-sm font-bold text-gray-900">{project.business_days_worked} days</span>
              </div>
            </div>
          )}

          {project.jira_ticket_link && (
            <a
              href={project.jira_ticket_link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl border-2 border-amber-300 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105"
            >
              <div className="p-2 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <FiExternalLink className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-bold text-gray-900 group-hover:text-amber-700 transition-colors">Jira</span>
            </a>
          )}

          {project.sharepoint_link && (
            <a
              href={project.sharepoint_link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl border-2 border-teal-300 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105"
            >
              <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <FiExternalLink className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-bold text-gray-900 group-hover:text-teal-700 transition-colors">SharePoint</span>
            </a>
          )}

          <Link
            to={`/chat?projectId=${project.id}`}
            className="group flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-[#E20074] to-pink-600 rounded-xl border-2 border-pink-400 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-110"
          >
            <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-lg">
              <FiMessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-bold text-white">Chat</span>
          </Link>
        </div>
      </div>

      {/* Pinned Links Section */}
      {project.pinned_links && project.pinned_links.length > 0 && (
        <div className="mb-4 p-3 bg-white/60 backdrop-blur-sm rounded-xl border border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            {project.pinned_links.map((link, idx) => (
              <a
                key={idx}
                href={link.url || link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-100 to-purple-100 hover:from-indigo-200 hover:to-purple-200 rounded-lg border border-indigo-200 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <FiLink2 className="w-4 h-4 text-indigo-700 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-semibold text-indigo-900">{link.label || link.name || 'Link'}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {project.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">{project.description}</p>
      )}

      {/* Status Badges */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm ${getStatusColor(project.status)}`}>
          {project.status}
        </span>
        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm ${getReportingStatusColor(project.reporting_status)}`}>
          {project.reporting_status.replace('_', ' ')}
        </span>
        {project.technology_type && (
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800 shadow-sm">
            {project.technology_type}
          </span>
        )}
      </div>

      {/* Linked Docs */}
      {(project.parent_doc_id || (project.supporting_doc_ids && project.supporting_doc_ids.length > 0)) && (
        <div className="mb-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
          {project.parent_doc_id && (
            <div className="flex items-center gap-2 mb-2">
              <FiFileText className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-900">Main Doc:</span>
              <span className="text-xs text-blue-700 font-medium">{project.parent_doc_id}</span>
            </div>
          )}
          {project.supporting_doc_ids && project.supporting_doc_ids.length > 0 && (
            <div className="flex items-center gap-2">
              <FiFileText className="w-4 h-4 text-gray-600" />
              <span className="text-xs font-semibold text-gray-700">Supporting:</span>
              <span className="text-xs text-gray-600">{project.supporting_doc_ids.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between pt-4 border-t border-gray-200">
        <div>
          {project.vulnerabilities && project.vulnerabilities.length > 0 && (
            <p className="text-xs text-gray-600">
              <span className="font-semibold text-gray-900">{project.vulnerabilities.length}</span> vulnerability{project.vulnerabilities.length !== 1 ? 'ies' : ''} found
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectCard;

