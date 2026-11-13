import { useState, useEffect } from 'react';

// useCountUp React hook for animating numerical values
export function useCountUp(target: number, durationMs = 1500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const start = 0;
    const end = target;
    if (start === end) {
      setCount(end);
      return;
    }
    const totalSteps = 45;
    const stepTime = durationMs / totalSteps;
    const increment = (end - start) / totalSteps;

    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      setCount(prev => {
        const next = start + increment * currentStep;
        if (currentStep >= totalSteps) {
          clearInterval(timer);
          return end;
        }
        return Math.round(next);
      });
    }, stepTime);

    return () => clearInterval(timer);
  }, [target, durationMs]);

  return count;
}
