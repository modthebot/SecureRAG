import React from 'react';
import { FiTag, FiClock, FiMessageCircle, FiCheckCircle } from 'react-icons/fi';

function KickoffStatus({ status, onStatusChange, projectId, disabled = false }) {
  const statusOptions = [
    { value: 'ticket_assigned', label: 'Ticket Assigned', icon: FiTag, color: 'bg-purple-100 text-purple-800 border-purple-300' },
    { value: 'queued', label: 'Meeting Queued', icon: FiClock, color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    { value: 'in_talks', label: 'In Talks', icon: FiMessageCircle, color: 'bg-blue-100 text-blue-800 border-blue-300' },
    { value: 'done', label: 'Done', icon: FiCheckCircle, color: 'bg-green-100 text-green-800 border-green-300' },
  ];

  const currentStatus = statusOptions.find(opt => opt.value === status) || statusOptions[0];
  const Icon = currentStatus.icon;

  const handleStatusChange = (newStatus) => {
    if (!disabled && onStatusChange) {
      onStatusChange(newStatus);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">Kickoff Status</label>
      <div className="flex gap-2 flex-wrap">
        {statusOptions.map((option) => {
          const OptionIcon = option.icon;
          const isActive = option.value === status;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleStatusChange(option.value)}
              disabled={disabled}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all
                ${isActive 
                  ? `${option.color} border-current font-semibold` 
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <OptionIcon className="w-4 h-4" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default KickoffStatus;

