import React, { useState, useEffect, useRef } from 'react';
import { format, eachDayOfInterval, isWeekend } from 'date-fns';
import { FiEdit, FiTrash2, FiExternalLink, FiCalendar, FiUser, FiMessageCircle, FiCheck, FiPlus, FiX, FiLoader, FiLink2 } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { updateProject } from '../api';
import KickoffStatus from './KickoffStatus';

// Helper function to calculate business days (excluding weekends - Saturday and Sunday)
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

// Static pentesting stages checklist
const STATIC_PENTEST_STAGES = [
  'Ticket Assigned',
  'Kickoff',
  'Accounts Received',
  'Enumeration',
  'Manual Testing',
  'Automated Testing',
  'Lateral Movement',
  'Exploitation',
  'Known CVE',
  'Compliance',
  'Reporting',
  'Shared report 1on1 to PSM',
  'Uploaded report on Sharepoint',
  'Sent Emails to Stakeholders',
  'Last Jira Ticket Closed'
];

function OngoingProjectCard({ project, onEdit, onDelete, onUpdate }) {
  const [notes, setNotes] = useState(project.notes || '');
  const [tests, setTests] = useState(project.tests_checklist || []);
  const [newTest, setNewTest] = useState('');
  const [newStage, setNewStage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [leaveDays, setLeaveDays] = useState(project.leave_days || 0);
  const [isCompleted, setIsCompleted] = useState(!!project.completed_date);
  const [kickoffStatus, setKickoffStatus] = useState(project.kickoff_status || 'queued');
  const lastProcessedStagesRef = useRef(null); // Track last processed stages to prevent infinite loops
  
  // Initialize pentest stages - ensure static stages are in correct order
  const initializePentestStages = (existingStages) => {
    // Create a map of existing stages by name to preserve done/date status
    const existingMap = new Map();
    if (existingStages && existingStages.length > 0) {
      existingStages.forEach(stage => {
        existingMap.set(stage.stage, stage);
      });
    }

    // Build stages array: static stages first in correct order, then custom stages
    const staticStages = STATIC_PENTEST_STAGES.map(stage => {
      const existing = existingMap.get(stage);
      if (existing) {
        // Preserve existing status but ensure isStatic is true
        return { ...existing, isStatic: true };
      }
      // New static stage
      return {
        stage,
        done: false,
        date: null,
        isStatic: true
      };
    });

    // Add any custom stages (non-static) that aren't in the static list
    const customStages = existingStages
      ? existingStages.filter(s => !STATIC_PENTEST_STAGES.includes(s.stage))
      : [];

    return [...staticStages, ...customStages];
  };

  const [pentestStages, setPentestStages] = useState(() => {
    return initializePentestStages(project.pentest_stages);
  });

  useEffect(() => {
    // Sync completion state
    setIsCompleted(!!project.completed_date);
    setLeaveDays(project.leave_days || 0);
    setKickoffStatus(project.kickoff_status || 'queued');
  }, [project.completed_date, project.leave_days, project.kickoff_status]);

  useEffect(() => {
    // Prevent infinite loop: only process if stages actually changed
    const currentStagesKey = project.pentest_stages ? JSON.stringify(project.pentest_stages.map(s => ({stage: s.stage, done: s.done}))) : 'null';
    if (lastProcessedStagesRef.current === currentStagesKey) {
      return; // Already processed this data, skip
    }
    lastProcessedStagesRef.current = currentStagesKey;
    
    // Sync with project data when it updates, ensuring correct order
    // BUT: Don't auto-re-add static stages if they were intentionally removed
    // Only fix order/position, not missing stages
    if (project.pentest_stages) {
      // Preserve the actual stages from the database (don't force-add missing static stages)
      const existingStages = project.pentest_stages.map(stage => {
        // Mark as static if it's in the static list, but don't add missing ones
        const isStatic = STATIC_PENTEST_STAGES.includes(stage.stage);
        return { ...stage, isStatic };
      });
      
      // Only reorder static stages that are present, don't add missing ones
      const staticStagesPresent = existingStages.filter(s => s.isStatic);
      const customStages = existingStages.filter(s => !s.isStatic);
      
      // Reorder static stages to match STATIC_PENTEST_STAGES order
      const reorderedStaticStages = STATIC_PENTEST_STAGES
        .map(staticStage => staticStagesPresent.find(s => s.stage === staticStage))
        .filter(Boolean); // Remove undefined (missing static stages)
      
      const updatedStages = [...reorderedStaticStages, ...customStages];
      
      // Check if order changed by comparing static stage positions
      const staticStagesInProject = project.pentest_stages
        .filter(s => STATIC_PENTEST_STAGES.includes(s.stage))
        .map(s => s.stage);
      const staticStagesInOrder = reorderedStaticStages.map(s => s.stage);
      
      const orderChanged = staticStagesInProject.length !== staticStagesInOrder.length ||
        staticStagesInProject.some((stage, idx) => stage !== staticStagesInOrder[idx]);
      
      // Only update state if stages actually changed (prevent infinite loop)
      const stagesChanged = JSON.stringify(pentestStages) !== JSON.stringify(updatedStages);
      if (stagesChanged) {
        setPentestStages(updatedStages);
      }
      
      // If order changed (but NOT if stages were removed), save the corrected order to database
      // Only fix ordering, don't re-add removed stages
      if (orderChanged && project.pentest_stages.length > 0 && staticStagesInProject.length === staticStagesInOrder.length) {
        const completed = updatedStages.filter(s => s.done).length;
        const total = updatedStages.length;
        const newProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
        // Use setTimeout to avoid immediate re-trigger
        setTimeout(() => {
          updateProject(project.id, { 
            pentest_stages: updatedStages,
            progress_percentage: newProgress
          }).catch(err => console.error('Error updating stage order:', err));
        }, 100);
      }
    } else {
      // No stages yet, initialize with static stages
      const initialStages = STATIC_PENTEST_STAGES.map(stage => ({
        stage,
        done: false,
        date: null,
        isStatic: true
      }));
      setPentestStages(initialStages);
    }
  }, [project.id, project.pentest_stages]);

  // Calculate business days remaining (excluding weekends)
  const businessDaysRemaining = project.end_date && !isCompleted
    ? Math.max(0, calculateBusinessDays(new Date(), new Date(project.end_date)))
    : null;

  // Calculate business days worked
  const businessDaysWorked = project.completed_date && project.start_date
    ? calculateBusinessDays(new Date(project.start_date), new Date(project.completed_date)) - (project.leave_days || 0)
    : (project.business_days_worked || 0);

  // Calculate weighted progress percentage from pentest stages
  const calculateWeightedProgress = (stages) => {
    const PREPARATION_STAGES = ['Kickoff', 'Accounts Received'];
    const MAIN_TESTING_STAGES = [
      'Enumeration', 'Manual Testing', 'Automated Testing',
      'Lateral Movement', 'Exploitation', 'Known CVE', 'Compliance'
    ];
    const FINAL_STAGES = [
      'Reporting', 'Shared report 1on1 to PSM',
      'Uploaded report on Sharepoint', 'Sent Emails to Stakeholders',
      'Last Jira Ticket Closed'
    ];
    
    const prepCompleted = stages.filter(s => 
      PREPARATION_STAGES.includes(s.stage) && s.done
    ).length;
    const prepTotal = stages.filter(s => 
      PREPARATION_STAGES.includes(s.stage)
    ).length;
    
    const mainCompleted = stages.filter(s => 
      MAIN_TESTING_STAGES.includes(s.stage) && s.done
    ).length;
    const mainTotal = stages.filter(s => 
      MAIN_TESTING_STAGES.includes(s.stage)
    ).length;
    
    const finalCompleted = stages.filter(s => 
      FINAL_STAGES.includes(s.stage) && s.done
    ).length;
    const finalTotal = stages.filter(s => 
      FINAL_STAGES.includes(s.stage)
    ).length;
    
    const prepPct = prepTotal > 0 ? (prepCompleted / prepTotal * 10) : 0;
    const mainPct = mainTotal > 0 ? (mainCompleted / mainTotal * 80) : 0;
    const finalPct = finalTotal > 0 ? (finalCompleted / finalTotal * 10) : 0;
    
    return Math.round(prepPct + mainPct + finalPct);
  };
  
  const progress = calculateWeightedProgress(pentestStages);
  const totalStages = Array.isArray(pentestStages) ? pentestStages.length : 0;
  const completedStages = Array.isArray(pentestStages)
    ? pentestStages.filter((s) => s && s.done).length
    : 0;

  const handleSaveNotes = async () => {
    setIsSaving(true);
    try {
      await updateProject(project.id, { notes });
      onUpdate();
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTest = async () => {
    if (isSaving) return;
    if (!newTest.trim()) return;
    const updatedTests = [...tests, { test: newTest.trim(), done: false, date: null }];
    setTests(updatedTests);
    setNewTest('');
    setIsSaving(true);
    try {
      await updateProject(project.id, { tests_checklist: updatedTests });
      onUpdate();
    } catch (error) {
      console.error('Error saving test:', error);
      alert('Failed to save test');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTest = async (index) => {
    if (isSaving) return;
    const updatedTests = [...tests];
    updatedTests[index].done = !updatedTests[index].done;
    if (updatedTests[index].done) {
      updatedTests[index].date = new Date().toISOString();
    }
    setTests(updatedTests);
    setIsSaving(true);
    try {
      await updateProject(project.id, { tests_checklist: updatedTests });
      onUpdate();
    } catch (error) {
      console.error('Error updating test:', error);
      alert('Failed to update test');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTest = async (index) => {
    if (isSaving) return;
    const updatedTests = tests.filter((_, i) => i !== index);
    setTests(updatedTests);
    setIsSaving(true);
    try {
      await updateProject(project.id, { tests_checklist: updatedTests });
      onUpdate();
    } catch (error) {
      console.error('Error deleting test:', error);
      alert('Failed to delete test');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStage = async (index) => {
    if (isSaving) return;
    const updatedStages = [...pentestStages];
    updatedStages[index].done = !updatedStages[index].done;
    if (updatedStages[index].done) {
      updatedStages[index].date = new Date().toISOString();
    } else {
      updatedStages[index].date = null;
    }
    setPentestStages(updatedStages);
    setIsSaving(true);
    try {
      // Calculate weighted progress and update
      const prepCompleted = updatedStages.filter(s => ['Kickoff', 'Accounts Received'].includes(s.stage) && s.done).length;
      const prepTotal = updatedStages.filter(s => ['Kickoff', 'Accounts Received'].includes(s.stage)).length;
      const mainCompleted = updatedStages.filter(s => ['Enumeration', 'Manual Testing', 'Automated Testing', 'Lateral Movement', 'Exploitation', 'Known CVE', 'Compliance'].includes(s.stage) && s.done).length;
      const mainTotal = updatedStages.filter(s => ['Enumeration', 'Manual Testing', 'Automated Testing', 'Lateral Movement', 'Exploitation', 'Known CVE', 'Compliance'].includes(s.stage)).length;
      const finalCompleted = updatedStages.filter(s => ['Reporting', 'Shared report 1on1 to PSM', 'Uploaded report on Sharepoint', 'Sent Emails to Stakeholders', 'Last Jira Ticket Closed'].includes(s.stage) && s.done).length;
      const finalTotal = updatedStages.filter(s => ['Reporting', 'Shared report 1on1 to PSM', 'Uploaded report on Sharepoint', 'Sent Emails to Stakeholders', 'Last Jira Ticket Closed'].includes(s.stage)).length;
      const newProgress = Math.round(
        (prepTotal > 0 ? prepCompleted / prepTotal * 10 : 0) +
        (mainTotal > 0 ? mainCompleted / mainTotal * 80 : 0) +
        (finalTotal > 0 ? finalCompleted / finalTotal * 10 : 0)
      );
      await updateProject(project.id, { 
        pentest_stages: updatedStages,
        progress_percentage: newProgress
      });
      onUpdate();
    } catch (error) {
      console.error('Error updating stage:', error);
      alert('Failed to update stage');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStage = async () => {
    if (isSaving) return;
    if (!newStage.trim()) return;
    const updatedStages = [...pentestStages, { 
      stage: newStage.trim(), 
      done: false, 
      date: null,
      isStatic: false
    }];
    setPentestStages(updatedStages);
    setNewStage('');
    setIsSaving(true);
    try {
      await updateProject(project.id, { pentest_stages: updatedStages });
      onUpdate();
    } catch (error) {
      console.error('Error adding stage:', error);
      alert('Failed to add stage');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStage = async (index) => {
    // Don't allow deleting static stages
    if (pentestStages[index].isStatic) {
      alert('Cannot delete static pentesting stages');
      return;
    }
    const updatedStages = pentestStages.filter((_, i) => i !== index);
    setPentestStages(updatedStages);
    setIsSaving(true);
    try {
      const prepCompleted = updatedStages.filter(s => ['Kickoff', 'Accounts Received'].includes(s.stage) && s.done).length;
      const prepTotal = updatedStages.filter(s => ['Kickoff', 'Accounts Received'].includes(s.stage)).length;
      const mainCompleted = updatedStages.filter(s => ['Enumeration', 'Manual Testing', 'Automated Testing', 'Lateral Movement', 'Exploitation', 'Known CVE', 'Compliance'].includes(s.stage) && s.done).length;
      const mainTotal = updatedStages.filter(s => ['Enumeration', 'Manual Testing', 'Automated Testing', 'Lateral Movement', 'Exploitation', 'Known CVE', 'Compliance'].includes(s.stage)).length;
      const finalCompleted = updatedStages.filter(s => ['Reporting', 'Shared report 1on1 to PSM', 'Uploaded report on Sharepoint', 'Sent Emails to Stakeholders', 'Last Jira Ticket Closed'].includes(s.stage) && s.done).length;
      const finalTotal = updatedStages.filter(s => ['Reporting', 'Shared report 1on1 to PSM', 'Uploaded report on Sharepoint', 'Sent Emails to Stakeholders', 'Last Jira Ticket Closed'].includes(s.stage)).length;
      const newProgress = Math.round(
        (prepTotal > 0 ? prepCompleted / prepTotal * 10 : 0) +
        (mainTotal > 0 ? mainCompleted / mainTotal * 80 : 0) +
        (finalTotal > 0 ? finalCompleted / finalTotal * 10 : 0)
      );
      await updateProject(project.id, { 
        pentest_stages: updatedStages,
        progress_percentage: newProgress
      });
      onUpdate();
    } catch (error) {
      console.error('Error deleting stage:', error);
      alert('Failed to delete stage');
    } finally {
      setIsSaving(false);
    }
  };

  const completedTests = tests.filter(t => t.done).length;
  const totalTests = tests.length;
  const testsProgress = totalTests > 0 ? (completedTests / totalTests) * 100 : 0;

  const handleCompleteProject = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const completedDate = new Date().toISOString();
      const startDate = project.start_date ? new Date(project.start_date) : null;
      const businessDays = startDate ? calculateBusinessDays(startDate, new Date()) - (leaveDays || 0) : 0;
      
      await updateProject(project.id, {
        status: 'past',
        completed_date: completedDate,
        leave_days: leaveDays || 0,
        business_days_worked: Math.max(0, businessDays)
      });
      setIsCompleted(true);
      setShowCompleteModal(false);
      onUpdate();
    } catch (error) {
      console.error('Error completing project:', error);
      alert('Failed to complete project');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKickoffStatusChange = async (newStatus) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      setKickoffStatus(newStatus);
      await updateProject(project.id, { kickoff_status: newStatus });
      onUpdate();
    } catch (error) {
      console.error('Error updating kickoff status:', error);
      alert('Failed to update kickoff status');
      setKickoffStatus(project.kickoff_status || 'queued'); // Revert on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleUncompleteProject = async () => {
    if (isSaving) return;
    if (!window.confirm('Are you sure you want to mark this project as incomplete?')) {
      return;
    }
    setIsSaving(true);
    try {
      await updateProject(project.id, {
        status: 'ongoing',
        completed_date: null,
        leave_days: 0,
        business_days_worked: 0
      });
      setIsCompleted(false);
      setLeaveDays(0);
      onUpdate();
    } catch (error) {
      console.error('Error uncompleting project:', error);
      alert('Failed to update project');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-300 rounded-xl shadow-lg hover:shadow-xl transition-all relative w-full">
      {isSaving && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 text-xs text-gray-600 bg-white/90 px-3 py-1.5 rounded-full shadow">
          <svg
            className="animate-spin h-4 w-4 text-gray-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          <span>Saving...</span>
        </div>
      )}
      
      {/* Top Header Section: Project Name, PSM, Start Date, Links */}
      <div className="p-4 lg:p-5 xl:p-6 border-b-2 border-green-200 bg-white/50">
        <div className="flex items-start justify-between mb-3 lg:mb-4">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h3 className="text-xl lg:text-2xl xl:text-2xl font-bold text-gray-800 truncate">{project.name}</h3>
              <span className="px-2.5 py-1 bg-green-500 text-white text-xs lg:text-sm font-semibold rounded-full flex-shrink-0">ONGOING</span>
          </div>
          {project.description && (
              <p className="text-sm lg:text-base text-gray-600 mb-3 line-clamp-2">{project.description}</p>
          )}
            <div className="flex flex-wrap items-center gap-2 lg:gap-2.5 xl:gap-3 text-xs lg:text-sm">
              <div className="w-full mb-2">
                <KickoffStatus
                  status={kickoffStatus}
                  onStatusChange={handleKickoffStatusChange}
                  projectId={project.id}
                  disabled={isSaving}
                />
              </div>
              {project.start_date && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <FiCalendar className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-gray-900">
                    Start: {format(new Date(project.start_date), 'MMM dd, yyyy')}
                  </span>
                </div>
              )}
              {project.psm_name && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
                  <FiUser className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold text-gray-900">PSM: {project.psm_name}</span>
                </div>
              )}
              {project.jira_ticket_link && (
                <a
                  href={project.jira_ticket_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100 hover:to-yellow-100 rounded-lg border border-amber-200 transition-all duration-200"
                  title="Jira"
                >
                  <div className="p-1 bg-gradient-to-br from-amber-500 to-yellow-600 rounded">
                    <FiLink2 className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-amber-900">Jira</span>
                </a>
              )}
              {project.sharepoint_link && (
                <a
                  href={project.sharepoint_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-teal-50 to-cyan-50 hover:from-teal-100 hover:to-cyan-100 rounded-lg border border-teal-200 transition-all duration-200"
                  title="SharePoint"
                >
                  <div className="p-1 bg-gradient-to-br from-teal-500 to-cyan-600 rounded">
                    <FiLink2 className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-teal-900">SharePoint</span>
                </a>
              )}
              <Link
                to={`/chat?projectId=${project.id}`}
                className="group flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[#E20074] to-pink-600 hover:from-[#E20074] hover:to-pink-700 rounded-lg border border-pink-400 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <FiMessageCircle className="w-4 h-4 text-white" />
                <span className="font-semibold text-white">Chat</span>
              </Link>
            </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(project)}
              type="button"
              disabled={isSaving}
              className="p-2 text-gray-600 hover:text-[#E20074] hover:bg-white/50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Edit project"
          >
            <FiEdit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(project.id)}
              type="button"
              disabled={isSaving}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-white/50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete project"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      </div>

      {/* Horizontal Layout: Left (Progress/Charts) + Right (Stages/Tests/Notes) */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 xl:gap-6 p-4 lg:p-5 xl:p-6 min-h-0">

        {/* Left Side: Progress Charts */}
        <div className="flex-shrink-0 w-full lg:w-64 xl:w-72 2xl:w-80 space-y-3 lg:space-y-4">
        {/* Overall Progress */}
          <div className="bg-white rounded-lg p-3 lg:p-4 xl:p-5 border border-gray-200 shadow-sm">
            <div className="text-xs lg:text-sm font-semibold text-gray-600 mb-2 lg:mb-3">Overall Progress</div>
            <div className="relative w-full h-3 lg:h-4 bg-gray-200 rounded-full overflow-hidden">
            <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-blue-500 transition-[width] duration-500 ease-out will-change-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
            <div className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-800 mt-2 lg:mt-3">{progress}%</div>
            <div className="text-xs lg:text-sm text-gray-500 mt-1 lg:mt-2">{completedStages}/{totalStages} stages</div>
        </div>

          {/* Days Remaining / Business Days Worked */}
          <div className="bg-white rounded-lg p-3 lg:p-4 xl:p-5 border border-gray-200 shadow-sm">
            {isCompleted ? (
              <>
                <div className="text-xs lg:text-sm font-semibold text-gray-600 mb-2 lg:mb-3">Business Days Worked</div>
                <div className="text-xl lg:text-2xl xl:text-3xl font-bold text-green-600">{businessDaysWorked}</div>
                <div className="text-xs lg:text-sm text-gray-500 mt-1 lg:mt-2">
                  {project.leave_days > 0 && `(${project.leave_days} days on leave)`}
                </div>
                {project.completed_date && (
                  <div className="text-xs lg:text-sm text-gray-500 mt-1">
                    Completed: {format(new Date(project.completed_date), 'MMM dd, yyyy')}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-xs lg:text-sm font-semibold text-gray-600 mb-2 lg:mb-3">Business Days Remaining</div>
                {businessDaysRemaining !== null ? (
            <>
                    <div className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-800">{businessDaysRemaining}</div>
                    <div className="text-xs lg:text-sm text-gray-500 mt-1 lg:mt-2">
                {project.end_date && format(new Date(project.end_date), 'MMM dd, yyyy')}
              </div>
            </>
          ) : (
                  <div className="text-sm lg:text-base text-gray-500">No end date set</div>
          )}
              </>
            )}
            
            {/* Completion Toggle */}
            <div className="mt-3 lg:mt-4 pt-3 lg:pt-4 border-t border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCompleted}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setShowCompleteModal(true);
                    } else {
                      handleUncompleteProject();
                    }
                  }}
                  disabled={isSaving}
                  className="w-4 h-4 lg:w-5 lg:h-5 text-green-600 border-gray-300 rounded focus:ring-green-500 disabled:opacity-50"
                />
                <span className="text-xs lg:text-sm font-medium text-gray-700">Mark as Complete</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Side: Stages, Tests, Notes */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-3 lg:gap-4 xl:gap-5 min-w-0">
          {/* Pentesting Stages Checklist */}
          <div className="bg-white rounded-lg p-3 lg:p-4 xl:p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2 lg:mb-3">
              <div className="text-xs lg:text-sm font-semibold text-gray-700">Pentesting Stages</div>
              <div className="text-xs lg:text-sm text-gray-500">{completedStages}/{totalStages}</div>
            </div>
            <div className="relative w-full h-1.5 lg:h-2 bg-gray-200 rounded-full mb-2 lg:mb-3">
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-[width] duration-400 ease-out will-change-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="space-y-1.5 lg:space-y-2 max-h-40 lg:max-h-44 overflow-y-auto pr-1">
              {pentestStages.map((stageItem, actualIndex) => {
                return (
                <div key={actualIndex} className="flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm min-w-0">
                  <button
                    onClick={() => handleToggleStage(actualIndex)}
                    type="button"
                    disabled={isSaving}
                    className={`flex-shrink-0 w-4 h-4 lg:w-5 lg:h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      stageItem.done 
                        ? 'bg-blue-500 border-blue-500 text-white' 
                        : 'border-gray-300 hover:border-blue-400'
                    } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {stageItem.done && <FiCheck className="w-2.5 h-2.5 lg:w-3 lg:h-3" />}
                  </button>
                  <span className={`flex-1 truncate ${stageItem.done ? 'line-through text-gray-500' : 'text-gray-700'}`} title={stageItem.stage}>
                    {stageItem.stage}
                  </span>
                  {stageItem.date && (
                    <span className="text-xs lg:text-sm text-gray-400 flex-shrink-0">
                      {format(new Date(stageItem.date), 'MMM dd')}
                    </span>
                  )}
                  {!stageItem.isStatic && (
                    <button
                      onClick={() => handleDeleteStage(actualIndex)}
                      type="button"
                      disabled={isSaving}
                      className="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <FiX className="w-3 h-3 lg:w-4 lg:h-4" />
                    </button>
                  )}
                </div>
              );
              })}
            </div>
            <div className="flex gap-1.5 lg:gap-2 mt-2 lg:mt-3">
              <input
                type="text"
                value={newStage}
                onChange={(e) => setNewStage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddStage();
                  }
                }}
                placeholder="Add stage..."
                className="flex-1 px-2 lg:px-3 py-1 lg:py-1.5 text-xs lg:text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleAddStage}
                type="button"
                disabled={isSaving}
                className="px-2 lg:px-3 py-1 lg:py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiPlus className="w-3 h-3 lg:w-4 lg:h-4" />
              </button>
        </div>
      </div>

      {/* Tests Checklist */}
          <div className="bg-white rounded-lg p-3 lg:p-4 xl:p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2 lg:mb-3">
              <div className="text-xs lg:text-sm font-semibold text-gray-700">Tests Checklist</div>
              <div className="text-xs lg:text-sm text-gray-500">{completedTests}/{totalTests}</div>
        </div>
            <div className="relative w-full h-1.5 lg:h-2 bg-gray-200 rounded-full mb-2 lg:mb-3">
          <div 
                className="absolute top-0 left-0 h-full bg-green-500 transition-[width] duration-400 ease-out will-change-[width]"
            style={{ width: `${testsProgress}%` }}
          />
        </div>
            <div className="space-y-1.5 lg:space-y-2 max-h-40 lg:max-h-44 overflow-y-auto pr-1">
              {tests.length > 0 ? (
                tests.map((test, index) => (
                  <div key={index} className="flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm min-w-0">
              <button
                onClick={() => handleToggleTest(index)}
                      type="button"
                      disabled={isSaving}
                      className={`flex-shrink-0 w-4 h-4 lg:w-5 lg:h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  test.done 
                    ? 'bg-green-500 border-green-500 text-white' 
                    : 'border-gray-300 hover:border-green-400'
                      } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                      {test.done && <FiCheck className="w-2.5 h-2.5 lg:w-3 lg:h-3" />}
              </button>
                    <span className={`flex-1 truncate ${test.done ? 'line-through text-gray-500' : 'text-gray-700'}`} title={test.test}>
                {test.test}
              </span>
              {test.date && (
                      <span className="text-xs lg:text-sm text-gray-400 flex-shrink-0">
                  {format(new Date(test.date), 'MMM dd')}
                </span>
              )}
              <button
                onClick={() => handleDeleteTest(index)}
                      type="button"
                      disabled={isSaving}
                      className="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                      <FiX className="w-3 h-3 lg:w-4 lg:h-4" />
              </button>
                  </div>
                ))
              ) : (
                <div className="text-xs lg:text-sm text-gray-400 italic py-2">No tests added yet</div>
              )}
            </div>
            <div className="flex gap-1.5 lg:gap-2 mt-2 lg:mt-3">
          <input
            type="text"
            value={newTest}
            onChange={(e) => setNewTest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTest();
                  }
                }}
                placeholder="Add test..."
                className="flex-1 px-2 lg:px-3 py-1 lg:py-1.5 text-xs lg:text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-transparent"
          />
          <button
            onClick={handleAddTest}
                type="button"
                disabled={isSaving}
                className="px-2 lg:px-3 py-1 lg:py-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
                <FiPlus className="w-3 h-3 lg:w-4 lg:h-4" />
          </button>
        </div>
      </div>

          {/* Notes Section - Full Width */}
          <div className="lg:col-span-2 xl:col-span-2 2xl:col-span-2 bg-white rounded-lg p-3 lg:p-4 xl:p-5 border border-gray-200 shadow-sm">
            <div className="text-xs lg:text-sm font-semibold text-gray-700 mb-2 lg:mb-3">Notes</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleSaveNotes}
          placeholder="Add project notes..."
              rows={2}
              className="w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-transparent resize-none"
        />
          </div>
          </div>
      </div>

      {/* Complete Project Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Complete Project</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How many days were you on leave during this project?
              </label>
              <input
                type="number"
                min="0"
                value={leaveDays}
                onChange={(e) => setLeaveDays(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="0"
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCompleteModal(false);
                  setLeaveDays(project.leave_days || 0);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteProject}
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
        >
                {isSaving ? 'Completing...' : 'Complete Project'}
              </button>
            </div>
          </div>
      </div>
      )}
    </div>
  );
}

export default OngoingProjectCard;

