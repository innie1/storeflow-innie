import React from 'react';
import { logoMarkSvg, logoTagline, markForBusiness } from '@/lib/logo-marks';

interface StoreLogoProps {
  storeName: string;
  selectedStyle?: string;
  className?: string;
  /**
   * What the shop does, so the mark matches it.
   *
   * Every style drew the same shopping basket: a laundry got a basket of
   * groceries, and so did a barber, a cyber cafe and a car wash. The business
   * type is the second thing setup asks for and was then ignored at the exact
   * moment the shop's identity is drawn.
   */
  businessType?: string;
}

export function getLogoSvgMarkup(
  storeName: string,
  selectedStyle: string = 'minimalist',
  businessType?: string,
): string {
  const mark = markForBusiness(businessType);
  const tagline = logoTagline(mark);
  const name = storeName || 'Your Store';
  const initial = name.charAt(0).toUpperCase();

  const words = name.split(/\s+/);
  const initials = words.length > 1 
    ? (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
    : initial;

  let fontSize = 18;
  if (name.length > 25) fontSize = 11;
  else if (name.length > 20) fontSize = 13;
  else if (name.length > 15) fontSize = 15;

  switch (selectedStyle) {
    case 'modern':
      return `
        <svg viewBox="0 0 240 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <circle cx="120" cy="55" r="38" fill="none" stroke="#10B981" stroke-width="3.5" />
          ${logoMarkSvg(mark, '#10B981', '#F59E0B')}
          <text x="120" y="132" fill="#10B981" font-family="'Outfit', sans-serif" font-weight="900" font-size="${fontSize}" text-anchor="middle">${name}</text>
          <text x="120" y="152" fill="#4B5563" font-family="sans-serif" font-size="8.5" font-weight="bold" letter-spacing="2" text-anchor="middle">— ${tagline} —</text>
        </svg>
      `;
    case 'premium':
      return `
        <svg viewBox="0 0 240 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <circle cx="120" cy="60" r="38" fill="none" stroke="#D97706" stroke-width="2" />
          <circle cx="120" cy="60" r="35" fill="none" stroke="#D97706" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.7" />
          <text x="120" y="75" fill="#D97706" font-family="Georgia, serif" font-weight="bold" font-size="44" text-anchor="middle">${initial}</text>
          <path d="M 98,75 C 93,65 93,52 100,42" fill="none" stroke="#D97706" stroke-width="1.5" stroke-linecap="round" />
          <circle cx="95" cy="60" r="2" fill="#D97706" />
          <circle cx="98" cy="50" r="2" fill="#D97706" />
          <path d="M 132,45 C 137,55 137,68 130,78" fill="none" stroke="#D97706" stroke-width="1.5" stroke-linecap="round" />
          <circle cx="135" cy="62" r="2" fill="#D97706" />
          <circle cx="132" cy="72" r="2" fill="#D97706" />
          <text x="120" y="132" fill="#D97706" font-family="Georgia, serif" font-weight="bold" font-size="${fontSize}" letter-spacing="1" text-anchor="middle">${name.toUpperCase()}</text>
          <text x="120" y="152" fill="#A1A1AA" font-family="sans-serif" font-size="8" letter-spacing="1.5" text-anchor="middle">— ${tagline} —</text>
        </svg>
      `;
    case 'minimalist':
      return `
        <svg viewBox="0 0 240 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          ${logoMarkSvg(mark, '#0F172A', '#10B981')}
          <text x="120" y="128" fill="#0F172A" font-family="'Outfit', sans-serif" font-weight="bold" font-size="${fontSize}" letter-spacing="0.5" text-anchor="middle">${name}</text>
          <text x="120" y="148" fill="#64748B" font-family="sans-serif" font-size="8" letter-spacing="1" text-anchor="middle">${tagline}</text>
        </svg>
      `;
    case 'bold':
      return `
        <svg viewBox="0 0 240 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <path d="M 85,55 A 36,36 0 1,1 155,75" fill="none" stroke="#DC2626" stroke-width="3.5" stroke-linecap="round" opacity="0.85" />
          ${logoMarkSvg(mark, '#1E3A8A', '#DC2626')}
          <line x1="72" y1="50" x2="88" y2="50" stroke="#1E3A8A" stroke-width="3.5" stroke-linecap="round" />
          <line x1="66" y1="58" x2="86" y2="58" stroke="#1E3A8A" stroke-width="3.5" stroke-linecap="round" />
          <line x1="74" y1="66" x2="85" y2="66" stroke="#1E3A8A" stroke-width="3.5" stroke-linecap="round" />
          <rect x="113" y="36" width="7" height="12" fill="#DC2626" rx="0.5" />
          <rect x="122" y="32" width="7" height="16" fill="#DC2626" rx="0.5" />
          <text x="120" y="125" fill="#1E3A8A" font-family="'Outfit', sans-serif" font-weight="900" font-style="italic" font-size="${fontSize}" text-anchor="middle">${name}</text>
          <rect x="30" y="137" width="180" height="18" fill="#DC2626" rx="4" />
          <text x="120" y="149" fill="#FFFFFF" font-family="sans-serif" font-size="8.5" font-weight="bold" letter-spacing="1" text-anchor="middle">${tagline}</text>
        </svg>
      `;
    case 'professional':
      return `
        <svg viewBox="0 0 240 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <circle cx="120" cy="55" r="38" fill="none" stroke="#064E3B" stroke-width="3" />
          ${logoMarkSvg(mark, '#064E3B', '#059669')}
          <path d="M 112,44 C 112,36 128,36 128,44" fill="none" stroke="#064E3B" stroke-width="3" stroke-linecap="round" />
          <rect x="106" y="65" width="5.5" height="10" fill="#064E3B" rx="0.5" />
          <rect x="115" y="58" width="5.5" height="17" fill="#064E3B" rx="0.5" />
          <rect x="124" y="50" width="5.5" height="25" fill="#064E3B" rx="0.5" />
          <text x="120" y="128" fill="#064E3B" font-family="Georgia, serif" font-weight="bold" font-size="${fontSize}" text-anchor="middle">${name}</text>
          <text x="120" y="148" fill="#B45309" font-family="sans-serif" font-size="8.5" font-weight="semibold" letter-spacing="1" text-anchor="middle">— ${tagline} —</text>
        </svg>
      `;
    case 'creative':
      return `
        <svg viewBox="0 0 240 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="creativeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#F97316" />
              <stop offset="100%" stop-color="#EC4899" />
            </linearGradient>
          </defs>
          <circle cx="120" cy="60" r="40" fill="url(#creativeGrad)" opacity="0.16" />
          ${logoMarkSvg(mark, '#5B21B6', '#EC4899')}
          <path d="M 80,92 Q 120,102 160,92" fill="none" stroke="#5B21B6" stroke-width="2.5" stroke-linecap="round" />
          <text x="120" y="132" fill="#5B21B6" font-family="'Outfit', sans-serif" font-weight="bold" font-size="${fontSize}" text-anchor="middle">${name}</text>
          <text x="120" y="152" fill="#9333EA" font-family="sans-serif" font-size="8.5" font-weight="medium" letter-spacing="1" text-anchor="middle">${tagline}</text>
        </svg>
      `;
    default:
      return '';
  }
}

export default function StoreLogo({ storeName, selectedStyle = 'minimalist', className = 'w-16 h-16', businessType }: StoreLogoProps) {
  const svgMarkup = getLogoSvgMarkup(storeName, selectedStyle, businessType);
  return (
    <div 
      className={`flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}

export const LOGO_STYLES = [
  { id: 'modern', label: 'Modern' },
  { id: 'premium', label: 'Premium' },
  { id: 'minimalist', label: 'Minimalist' },
  { id: 'bold', label: 'Bold Retail' },
  { id: 'professional', label: 'Professional Business' },
  { id: 'creative', label: 'Creative Modern' },
];
