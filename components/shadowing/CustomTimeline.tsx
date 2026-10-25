import React, { useRef, useState } from 'react';

interface CustomTimelineProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const CustomTimeline: React.FC<CustomTimelineProps> = ({ currentTime, duration, onSeek }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const calculateTimeFromEvent = (e: React.PointerEvent | PointerEvent) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    return percentage * duration;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (duration <= 0) return;
    setIsDragging(true);
    const newTime = calculateTimeFromEvent(e);
    setDragTime(newTime);
    
    // Capture pointer to allow dragging outside the element
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const newTime = calculateTimeFromEvent(e);
    setDragTime(newTime);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const newTime = calculateTimeFromEvent(e);
    onSeek(newTime);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const displayTime = isDragging ? dragTime : currentTime;
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

  return (
    <div className="w-full flex flex-col sm:flex-row items-center gap-3 bg-[#e4dfd3] px-4 py-3 border-t-2 border-[#1c1d20]">
      {/* Scrub Track */}
      <div 
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative flex-1 h-5 w-full bg-[#16171a] border-2 border-[#1c1d20] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.8)] rounded-md cursor-pointer touch-none"
      >
        {/* Fill Bar */}
        <div 
          className="absolute top-0 left-0 h-full bg-[#cf573c] border-r-2 border-[#1c1d20]"
          style={{ width: `${progressPercent}%` }}
        />
        
        {/* Playhead Thumb */}
        <div 
          className="absolute top-1/2 -mt-3.5 -ml-2.5 w-5 h-7 bg-[#ebe6d8] border-2 border-[#1c1d20] shadow-[2px_2px_0px_#18191c] rounded active:translate-y-[1px] active:translate-x-[1px] active:shadow-[1px_1px_0px_#18191c]"
          style={{ left: `${progressPercent}%` }}
        >
          {/* Thumb Grips */}
          <div className="absolute inset-0 flex flex-col justify-center items-center gap-[2px]">
            <div className="w-2 h-[1px] bg-[#7a776e]"></div>
            <div className="w-2 h-[1px] bg-[#7a776e]"></div>
            <div className="w-2 h-[1px] bg-[#7a776e]"></div>
          </div>
        </div>
      </div>

      {/* Time Readout */}
      <div className="text-[10px] font-mono font-bold text-[#1c1d20] bg-[#c5bfb0] px-2 py-1.5 border-2 border-[#1c1d20] shadow-[inset_1px_1px_0px_rgba(0,0,0,0.2)] rounded select-none shrink-0 min-w-[90px] text-center tracking-widest">
        {formatTime(displayTime)} / {formatTime(duration)}
      </div>
    </div>
  );
};

export default CustomTimeline;
