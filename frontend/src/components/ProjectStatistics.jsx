import React, { useMemo } from 'react';
import { differenceInDays, differenceInBusinessDays, format } from 'date-fns';
import { FiCheckCircle, FiClock, FiTrendingUp, FiTarget } from 'react-icons/fi';

function ProjectStatistics({ projects }) {
  const businessDaysBetween = (start, end) => {
    if (!start || !end) return null;
    const s = new Date(start);
    const e = new Date(end);
    if (e <= s) return null;
    return differenceInBusinessDays(e, s);
  };

  const stats = useMemo(() => {
    const total = projects.length;
    const ongoing = projects.filter(p => p.status === 'ongoing').length;
    const completed = projects.filter(p => p.status === 'past').length;
    
    // Calculate average project duration
    const projectsWithDates = projects.filter(p => p.start_date && p.end_date);
    const avgDuration = projectsWithDates.length > 0
      ? projectsWithDates.reduce((sum, p) => {
          const days = differenceInDays(new Date(p.end_date), new Date(p.start_date));
          return sum + days;
        }, 0) / projectsWithDates.length
      : 0;

    // Calculate efficiency based on planned vs actual business days (can exceed 100% if faster)
    const efficiencies = projects
      .filter(p => p.status === 'past')
      .map(p => {
        const planned = businessDaysBetween(p.start_date, p.end_date);
        const actual = p.business_days_worked ?? businessDaysBetween(p.start_date, p.completed_date || p.end_date);
        if (!planned || !actual || actual <= 0) return null;
        return (planned / actual) * 100;
      })
      .filter(v => v !== null);

    const efficiency = efficiencies.length
      ? Math.round(efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length)
      : 0;

    return {
      total,
      ongoing,
      completed,
      avgDuration: Math.round(avgDuration),
      efficiency: Math.round(efficiency)
    };
  }, [projects]);

  const kpiCards = [
    {
      title: 'Total Projects',
      value: stats.total,
      icon: FiTarget,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700'
    },
    {
      title: 'Completed',
      value: stats.completed,
      icon: FiCheckCircle,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700'
    },
    {
      title: 'Ongoing',
      value: stats.ongoing,
      icon: FiClock,
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-700'
    },
    {
      title: 'Efficiency',
      value: `${stats.efficiency}%`,
      icon: FiTrendingUp,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700'
    },
    {
      title: 'Avg Duration',
      value: `${stats.avgDuration} days`,
      icon: FiClock,
      color: 'bg-indigo-500',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-700'
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Project Statistics & KPIs</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div
              key={index}
              className={`${kpi.bgColor} rounded-lg p-4 border-2 border-transparent hover:border-gray-300 transition-all`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`${kpi.color} text-white rounded-full p-2 w-8 h-8`} />
              </div>
              <div className={`text-2xl font-bold ${kpi.textColor} mb-1`}>
                {kpi.value}
              </div>
              <div className="text-xs font-medium text-gray-600">{kpi.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProjectStatistics;

