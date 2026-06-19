import React from 'react';

interface FlowIconProps {
  className?: string;
  size?: number;
}

export function FlowIcon({ className = "w-5 h-5 inline-block align-middle", size }: FlowIconProps) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg 
      className={className} 
      style={style}
      viewBox="0 0 512 512" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="bgGradFlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="#3d331d"/>
          <stop offset="70%" stopColor="#1a160b"/>
          <stop offset="100%" stopColor="#0d0b05"/>
        </radialGradient>

        <linearGradient id="goldGradFlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047"/>
          <stop offset="25%" stopColor="#eab308"/>
          <stop offset="50%" stopColor="#d4af37"/>
          <stop offset="75%" stopColor="#eab308"/>
          <stop offset="100%" stopColor="#fef08a"/>
        </linearGradient>

        <linearGradient id="innerGlowFlow" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#a16207" stopOpacity="0.8"/>
          <stop offset="50%" stopColor="#eab308" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#fef08a" stopOpacity="0.9"/>
        </linearGradient>

        <filter id="shadowFlow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="2" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.6"/>
        </filter>
      </defs>

      <circle cx="256" cy="256" r="236" fill="url(#bgGradFlow)" stroke="url(#goldGradFlow)" strokeWidth="12"/>
      <circle cx="256" cy="256" r="216" fill="none" stroke="url(#innerGlowFlow)" strokeWidth="3"/>
      <circle cx="256" cy="256" r="196" fill="none" stroke="url(#goldGradFlow)" strokeWidth="4" strokeDasharray="10 6" opacity="0.6"/>

      <g filter="url(#shadowFlow)">
        <text x="256" y="240" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="150" fontWeight="900" textAnchor="middle" fill="url(#goldGradFlow)">1</text>
        <text x="256" y="315" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="54" fontWeight="900" letterSpacing="4" textAnchor="middle" fill="url(#goldGradFlow)">FLOW</text>
        <polygon points="256,350 260,362 272,362 262,370 266,382 256,374 246,382 250,370 240,362 252,362" fill="url(#goldGradFlow)"/>
        <polygon points="216,356 220,366 230,366 222,373 225,383 216,376 207,383 210,373 202,366 212,366" fill="url(#goldGradFlow)" opacity="0.85"/>
        <polygon points="296,356 300,366 310,366 302,373 305,383 296,376 287,383 290,373 282,366 292,366" fill="url(#goldGradFlow)" opacity="0.85"/>
      </g>
    </svg>
  );
}

export default FlowIcon;
