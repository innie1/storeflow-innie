import React from 'react';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  icon?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useBodyScrollLock();

  if (!isOpen) return null;

  const styles = (() => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-destructive/15 text-destructive',
          confirmBtn: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-destructive/20',
          defaultIcon: '🗑️',
        };
      case 'warning':
        return {
          iconBg: 'bg-warning/15 text-warning',
          confirmBtn: 'bg-warning text-warning-foreground hover:bg-warning/90 shadow-warning/20',
          defaultIcon: '⚠️',
        };
      case 'primary':
      default:
        return {
          iconBg: 'bg-primary/15 text-primary',
          confirmBtn: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20',
          defaultIcon: '❓',
        };
    }
  })();

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl text-center space-y-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center mx-auto text-xl font-bold`}>
          {icon || styles.defaultIcon}
        </div>
        <div>
          <h4 className="font-display font-bold text-lg text-foreground">{title}</h4>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-border bg-surface-2 text-foreground font-display font-semibold text-sm hover:bg-surface-3 transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl font-display font-semibold text-sm transition-colors shadow-lg ${styles.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
