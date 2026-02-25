import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
export type TooltipVariant = 'default' | 'info' | 'success' | 'warning' | 'error';

const GAP = 8;

export interface TooltipProps {
  content: React.ReactNode;
  position?: TooltipPosition;
  variant?: TooltipVariant;
  delay?: number;
  children: React.ReactElement;
  className?: string;
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  position: preferredPosition = 'top',
  variant = 'default',
  delay = 300,
  children,
  className = '',
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: TooltipPosition } | null>(null);
  const [showTimeout, setShowTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltipEl = tooltipRef.current;
    if (!anchor || !tooltipEl) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const padding = 8;

    const placements: TooltipPosition[] = [preferredPosition, 'top', 'bottom', 'left', 'right'];
    let best: { top: number; left: number; placement: TooltipPosition } | null = null;

    for (const placement of placements) {
      let top = 0;
      let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;

      if (placement === 'top') {
        top = anchorRect.top - tooltipRect.height - GAP;
      } else if (placement === 'bottom') {
        top = anchorRect.bottom + GAP;
      } else if (placement === 'left') {
        top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
        left = anchorRect.left - tooltipRect.width - GAP;
      } else {
        top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
        left = anchorRect.right + GAP;
      }

      const inView =
        top >= padding &&
        top + tooltipRect.height <= viewport.h - padding &&
        left >= padding &&
        left + tooltipRect.width <= viewport.w - padding;

      if (inView) {
        best = { top, left, placement };
        break;
      }
    }

    if (!best) {
      const top = Math.max(padding, Math.min(anchorRect.top - tooltipRect.height - GAP, viewport.h - tooltipRect.height - padding));
      const left = Math.max(padding, Math.min(anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2, viewport.w - tooltipRect.width - padding));
      best = {
        top,
        left,
        placement: anchorRect.top < viewport.h / 2 ? 'bottom' : 'top',
      };
    }

    setCoords(best);
  }, [preferredPosition]);

  const handleMouseEnter = () => {
    if (disabled) return;
    const timeout = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    setShowTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (showTimeout) {
      clearTimeout(showTimeout);
      setShowTimeout(null);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      const raf = requestAnimationFrame(updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
        cancelAnimationFrame(raf);
      };
    } else {
      setCoords(null);
    }
  }, [isVisible, updatePosition]);

  useEffect(() => {
    return () => {
      if (showTimeout) clearTimeout(showTimeout);
    };
  }, [showTimeout]);

  const setRefs = useCallback((el: HTMLElement | null) => {
    anchorRef.current = el;
    const childRef = (children as React.ReactElement & { ref?: React.Ref<unknown> }).ref;
    if (typeof childRef === 'function') {
      childRef(el);
    } else if (childRef) {
      (childRef as React.MutableRefObject<unknown>).current = el;
    }
  }, [children]);

  const clonedChild = React.cloneElement(children, {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    ref: setRefs,
  });

  const placement = coords?.placement ?? preferredPosition;

  const tooltipContent = isVisible && !disabled && (
    <div
      ref={tooltipRef}
      className={`tooltip tooltip-portal tooltip-${placement} tooltip-${variant}`}
      role="tooltip"
      style={
        coords
          ? {
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              zIndex: 99999,
            }
          : { visibility: 'hidden' as const, position: 'fixed' as const, zIndex: 99999 }
      }
    >
      <div className="tooltip-content">{content}</div>
      <div className={`tooltip-arrow tooltip-arrow-${placement}`} />
    </div>
  );

  return (
    <div className={`tooltip-wrapper ${className}`} style={{ position: 'relative', display: 'inline-block' }}>
      {clonedChild}
      {tooltipContent && createPortal(tooltipContent, document.body)}
    </div>
  );
};

export default Tooltip;
