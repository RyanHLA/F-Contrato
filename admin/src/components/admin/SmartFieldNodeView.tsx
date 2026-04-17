import { NodeViewWrapper } from '@tiptap/react';
import { NodeViewProps } from '@tiptap/core';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface PopoverState {
  x: number;
  y: number;
}

export default function SmartFieldNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { field, label, value, placeholder } = node.attrs as {
    field: string;
    label: string;
    value: string;
    placeholder: string;
  };

  const isEmpty = !value || value.trim() === '';
  const [hovered, setHovered] = useState(false);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [inputVal, setInputVal] = useState(value ?? '');
  const spanRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPopover = useCallback(() => {
    if (!spanRef.current) return;
    const rect = spanRef.current.getBoundingClientRect();
    setInputVal(value ?? '');
    setPopover({ x: rect.left, y: rect.bottom + 6 });
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [value]);

  const closePopover = useCallback((save: boolean) => {
    if (save) {
      updateAttributes({ value: inputVal });
    }
    setPopover(null);
  }, [inputVal, updateAttributes]);

  /* Close on outside click */
  useEffect(() => {
    if (!popover) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        spanRef.current &&
        !spanRef.current.contains(e.target as Node)
      ) {
        closePopover(true);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popover, closePopover]);

  const pillStyle: React.CSSProperties = {
    display: 'inline',
    background: (hovered || selected) ? 'rgba(0,0,0,0.05)' : (isEmpty ? 'rgba(0,0,0,0.03)' : 'transparent'),
    border: 'none',
    borderBottom: `1px dashed ${isEmpty ? '#ccc' : (hovered ? '#999' : 'transparent')}`,
    borderRadius: 2,
    padding: '0 4px',
    cursor: 'pointer',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    color: isEmpty ? '#bbb' : 'inherit',
    verticalAlign: 'baseline',
    userSelect: 'none',
    outline: selected ? '2px solid rgba(59,130,246,0.3)' : 'none',
    outlineOffset: 2,
    transition: 'background 120ms, border-color 120ms',
  };

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <span
        ref={spanRef}
        style={pillStyle}
        data-smart-field={field}
        contentEditable={false}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openPopover();
        }}
        title={`Clique para editar: ${label}`}
      >
        {isEmpty ? (placeholder || '···') : value}
      </span>

      {popover && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            zIndex: 9999,
            left: Math.min(popover.x, window.innerWidth - 270),
            top: popover.y,
            background: '#fff',
            border: '1px solid #E2DFD8',
            borderRadius: 10,
            padding: '12px 14px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
            minWidth: 240,
            fontFamily: 'Montserrat, sans-serif',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#9B9B95', marginBottom: 8,
          }}>
            {label}
          </div>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); closePopover(true); }
              if (e.key === 'Escape') { closePopover(false); }
            }}
            placeholder={`Digite ${label.toLowerCase()}…`}
            style={{
              width: '100%',
              padding: '7px 10px',
              fontSize: 13,
              fontFamily: 'Montserrat, sans-serif',
              border: '1px solid #d4d4d8',
              borderRadius: 6,
              outline: 'none',
              color: '#18181b',
              boxSizing: 'border-box',
            }}
            onFocus={e => {
              const c = getComputedStyle(document.documentElement).getPropertyValue('--fotux-brand-color').trim() || '#2f5496';
              e.target.style.borderColor = c;
              e.target.style.boxShadow = `0 0 0 2px ${c}26`;
            }}
            onBlur={e => {
              e.target.style.borderColor = '#d4d4d8';
              e.target.style.boxShadow = 'none';
            }}
          />
          <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 6 }}>
            Enter para confirmar · Esc para cancelar
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button
              onClick={() => closePopover(false)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12,
                fontWeight: 500, cursor: 'pointer', border: '1px solid #d4d4d8',
                fontFamily: 'Montserrat, sans-serif', background: '#f4f4f5', color: '#3f3f46',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => closePopover(true)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12,
                fontWeight: 500, cursor: 'pointer', border: `1px solid var(--fotux-brand-color, #2f5496)`,
                fontFamily: 'Montserrat, sans-serif', background: 'var(--fotux-brand-color, #2f5496)', color: '#fff',
              }}
            >
              Confirmar
            </button>
          </div>
        </div>,
        document.body
      )}
    </NodeViewWrapper>
  );
}
