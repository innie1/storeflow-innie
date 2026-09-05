import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import FlowAdviceReport from '@/components/FlowAdviceReport';
import { readSource } from './helpers/source';

/**
 * generateFlowReport writes markdown. It used to be handed to the greeting
 * Typewriter, which puts raw characters into a <span> — so the merchant read
 * the markup itself: "### 📊 Store Performance Summary" and "**41/100**".
 */

const REPORT = [
  "Hi, I'm Flow, your business assistant. Here is a tailored analysis for Test Store. ",
  '',
  '### 📊 Store Performance Summary',
  'Your store performance is average (**41/100**). This week, you generated **₦167,000** in revenue.',
  '',
  '### 📦 Inventory Diagnostics',
  '🚨 **Out of Stock:** You have **1 product(s) completely sold out** (Indomie Chicken).',
  '',
  '### ⚡ Priority Recommendations',
  '1. **Restock Out-of-Stock Items:** Focus on replenishing Indomie Chicken immediately.',
  '2. **Collect Overdue Debts:** Recover ₦4,000.',
].join('\n');

describe('the Get Advice report', () => {
  it('renders markdown as markup, never as literal characters', () => {
    const { container } = render(<FlowAdviceReport report={REPORT} onDismiss={() => {}} />);
    const text = container.textContent || '';

    expect(text).not.toContain('###');
    expect(text).not.toContain('**');

    // The figures survive, as bold rather than asterisks.
    expect(text).toContain('41/100');
    expect(text).toContain('₦167,000');
    expect([...container.querySelectorAll('strong')].map(s => s.textContent))
      .toEqual(expect.arrayContaining(['41/100', '₦167,000']));
  });

  it('turns each section into its own heading', () => {
    render(<FlowAdviceReport report={REPORT} onDismiss={() => {}} />);
    for (const heading of ['Store Performance Summary', 'Inventory Diagnostics', 'Priority Recommendations']) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
  });

  it('renders the recommendations as a numbered list', () => {
    const { container } = render(<FlowAdviceReport report={REPORT} onDismiss={() => {}} />);
    const items = container.querySelectorAll('ol li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Restock Out-of-Stock Items');
  });

  it('does not read the report aloud unless asked', () => {
    const { container } = render(<FlowAdviceReport report={REPORT} onDismiss={() => {}} />);
    // Speech used to start by itself on every report, with no way to stop it.
    expect(container.querySelector('[aria-label="Read this aloud"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Stop reading aloud"]')).toBeNull();
  });
});

describe('the advice handler', () => {
  it('does not stall behind a delay for a synchronous report', () => {
    const source = readSource('src/components/Manager.tsx');
    const handler = source.slice(source.indexOf('const handleGetAdvice'), source.indexOf('const handleAutoFixConfirmed'));
    expect(handler).toContain('generateFlowReport(store)');
    expect(handler).not.toMatch(/setTimeout\([\s\S]*?,\s*1500\s*\)/);
  });
});
