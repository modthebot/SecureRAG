import React from 'react';

function SummaryView({ summary }) {
  if (!summary) {
    return <p className="text-gray-500">No summary available.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 p-6 transform hover:scale-[1.01] transition-all duration-300" style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.5)'
      }}>
        <h4 className="font-semibold text-gray-800 mb-3 text-lg">Summary</h4>
        <p className="text-sm text-gray-700 leading-relaxed">{summary.summary}</p>
      </div>

      {summary.technologies && summary.technologies.length > 0 && (
        <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 p-6 transform hover:scale-[1.01] transition-all duration-300" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.5)'
        }}>
          <h4 className="font-semibold text-gray-800 mb-3 text-lg">Technologies</h4>
          <div className="flex flex-wrap gap-2">
            {summary.technologies.map((tech, idx) => (
              <span
                key={idx}
                className="px-4 py-2 bg-blue-100/80 backdrop-blur-sm text-blue-800 text-sm rounded-full border border-blue-200/50 shadow-sm font-medium"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.focus_areas && summary.focus_areas.length > 0 && (
        <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 p-6 transform hover:scale-[1.01] transition-all duration-300" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.5)'
        }}>
          <h4 className="font-semibold text-gray-800 mb-3 text-lg">Focus Areas</h4>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-2 leading-relaxed">
            {summary.focus_areas.map((area, idx) => (
              <li key={idx}>{area}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.use_cases && summary.use_cases.length > 0 && (
        <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 p-6 transform hover:scale-[1.01] transition-all duration-300" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.5)'
        }}>
          <h4 className="font-semibold text-gray-800 mb-3 text-lg">Use Cases</h4>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-2 leading-relaxed">
            {summary.use_cases.map((useCase, idx) => (
              <li key={idx}>{useCase}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SummaryView;

