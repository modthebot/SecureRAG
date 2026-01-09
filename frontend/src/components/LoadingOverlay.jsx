import React from 'react';
import { FiAlertCircle } from 'react-icons/fi';

function LoadingOverlay({ message, subMessage, showTimeEstimate }) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (showTimeEstimate) {
      const interval = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [showTimeEstimate]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
        {/* Animated Spinner */}
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>

        {/* Main Message */}
        <h3 className="text-2xl font-bold text-gray-800 mb-2">{message || 'Processing...'}</h3>
        
        {subMessage && (
          <p className="text-gray-600 mb-4">{subMessage}</p>
        )}

        {/* Time Estimate */}
        {showTimeEstimate && elapsed > 0 && (
          <p className="text-sm text-gray-500 mb-4">Elapsed: {formatTime(elapsed)}</p>
        )}

        {/* Warning Message */}
        <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <FiAlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="font-semibold text-red-800 mb-1">Do not refresh this page</p>
              <p className="text-sm text-red-700">
                Your operation is in progress. Refreshing will interrupt the process and may cause data loss.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoadingOverlay;

