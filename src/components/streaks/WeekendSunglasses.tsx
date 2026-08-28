import { useEffect, useState } from 'react';

function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

export default function WeekendSunglasses({ className = '' }: { className?: string }) {
  const [weekend, setWeekend] = useState(isWeekend);

  useEffect(() => {
    const check = () => setWeekend(isWeekend());
    check();
    const id = window.setInterval(check, 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!weekend) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 z-20 ${className}`} aria-hidden="true">
      <div className="absolute left-[18%] right-[18%] top-[29%] h-[30%]">
        <div className="absolute left-0 top-1/2 h-[70%] w-[44%] -translate-y-1/2 rounded-[42%] bg-black shadow-[0_2px_7px_rgba(0,0,0,.35)]" />
        <div className="absolute right-0 top-1/2 h-[70%] w-[44%] -translate-y-1/2 rounded-[42%] bg-black shadow-[0_2px_7px_rgba(0,0,0,.35)]" />
        <div className="absolute left-[40%] right-[40%] top-1/2 h-[7%] -translate-y-1/2 rounded-full bg-black" />
        <div className="absolute left-[9%] top-[24%] h-[13%] w-[22%] rotate-[-12deg] rounded-full bg-white/20" />
        <div className="absolute right-[9%] top-[24%] h-[13%] w-[22%] rotate-[12deg] rounded-full bg-white/20" />
      </div>
    </div>
  );
}
