import { useEditor, EditorContent, Extensions } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter,
  AlignRight, List,
} from 'lucide-react';

interface ContractBlockProps {
  id: string;
  initialContent: string; // TipTap JSON string
  onChange: (id: string, json: string) => void;
  extensions: Extensions;
}

export default function ContractBlock({ id, initialContent, onChange, extensions }: ContractBlockProps) {
  const [state, setState] = useState<'rest' | 'hover' | 'editing'>('rest');
  const wrapRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions,
    content: (() => {
      try { return JSON.parse(initialContent); } catch { return initialContent; }
    })(),
    editable: false,
    onUpdate({ editor }) {
      onChange(id, JSON.stringify(editor.getJSON()));
    },
  });

  const enterEdit = () => {
    setState('editing');
    editor?.setEditable(true);
    setTimeout(() => editor?.commands.focus('end'), 30);
  };

  /* Exit editing on outside click */
  useEffect(() => {
    if (state !== 'editing') return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        // Check portal popover (rendered in body, outside wrapRef)
        const target = e.target as HTMLElement;
        if (target.closest('[data-smart-popover]')) return;
        setState('rest');
        editor?.setEditable(false);
        editor?.commands.blur();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [state, editor]);

  const isEditing = state === 'editing';
  const isHover   = state === 'hover';

  const borderColor = isEditing ? '#3b82f6' : isHover ? '#94a3b8' : 'transparent';
  const borderStyle = isEditing ? 'solid' : 'dashed';

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => { if (state === 'rest') setState('hover'); }}
      onMouseLeave={() => { if (state === 'hover') setState('rest'); }}
      onDoubleClick={enterEdit}
      style={{
        position: 'relative',
        border: `1.5px ${borderStyle} ${borderColor}`,
        borderRadius: 4,
        padding: '4px 6px',
        margin: '0 -6px',
        transition: 'border-color 150ms',
        cursor: isEditing ? 'text' : isHover ? 'text' : 'default',
      }}
    >
      {/* ✓ × actions — top right corner when editing */}
      {isEditing && (
        <div
          style={{
            position: 'absolute', top: -1, right: -1,
            display: 'flex', gap: 0,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '0 4px 0 4px',
            overflow: 'hidden',
            zIndex: 10,
          }}
          onMouseDown={e => e.preventDefault()}
        >
          <button
            onClick={() => { setState('rest'); editor?.setEditable(false); editor?.commands.blur(); }}
            title="Confirmar (salvar)"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 24, border: 'none', borderRight: '1px solid #e2e8f0',
              background: 'transparent', cursor: 'pointer', color: '#16a34a',
              fontSize: 14, fontWeight: 700, transition: 'background 120ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            ✓
          </button>
          <button
            onClick={() => { setState('rest'); editor?.setEditable(false); editor?.commands.blur(); }}
            title="Cancelar"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 24, border: 'none',
              background: 'transparent', cursor: 'pointer', color: '#dc2626',
              fontSize: 14, fontWeight: 700, transition: 'background 120ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            ✕
          </button>
        </div>
      )}

      <EditorContent editor={editor} />

      {/* Bottom toolbar — slides in on editing */}
      <div
        onMouseDown={e => e.preventDefault()}
        style={{
          overflow: 'hidden',
          maxHeight: isEditing ? 48 : 0,
          opacity: isEditing ? 1 : 0,
          transition: 'max-height 180ms ease, opacity 150ms ease',
        }}
      >
        {editor && (
          <div style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap',
            gap: 2, padding: '5px 8px',
            borderTop: '1px solid #e2e8f0',
            marginTop: 4,
            background: '#f8fafc',
            borderRadius: '0 0 4px 4px',
          }}>
            <ToolBtn active={editor.isActive('bold')} onClick={() => (editor.chain().focus() as any).toggleBold().run()} title="Negrito">
              <Bold size={13} strokeWidth={2.5} />
            </ToolBtn>
            <ToolBtn active={editor.isActive('italic')} onClick={() => (editor.chain().focus() as any).toggleItalic().run()} title="Itálico">
              <Italic size={13} />
            </ToolBtn>
            <ToolBtn active={editor.isActive('underline')} onClick={() => (editor.chain().focus() as any).toggleUnderline().run()} title="Sublinhado">
              <Underline size={13} />
            </ToolBtn>

            <Divider />

            <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => (editor.chain().focus() as any).setTextAlign('left').run()} title="Esquerda">
              <AlignLeft size={13} />
            </ToolBtn>
            <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => (editor.chain().focus() as any).setTextAlign('center').run()} title="Centro">
              <AlignCenter size={13} />
            </ToolBtn>
            <ToolBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => (editor.chain().focus() as any).setTextAlign('right').run()} title="Direita">
              <AlignRight size={13} />
            </ToolBtn>

            <Divider />

            <ToolBtn active={editor.isActive('bulletList')} onClick={() => (editor.chain().focus() as any).toggleBulletList().run()} title="Lista com marcadores">
              <List size={13} />
            </ToolBtn>

            <Divider />

            <HeadingBtn editor={editor} level={1} label="H1" />
            <HeadingBtn editor={editor} level={2} label="H2" />
            <HeadingBtn editor={editor} level={3} label="H3" />

            <Divider />

            <input
              type="color"
              defaultValue="#1a1a1a"
              onChange={e => (editor.chain().focus() as any).setColor(e.target.value).run()}
              title="Cor do texto"
              style={{
                width: 22, height: 22, padding: 0,
                border: '1px solid #e2e8f0', borderRadius: 4,
                cursor: 'pointer', background: 'transparent',
              }}
            />

            <div style={{ flex: 1 }} />
            <span style={{
              fontSize: 9, color: '#94a3b8',
              fontFamily: 'Montserrat, sans-serif', paddingRight: 4,
            }}>
              Clique fora para fechar
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Toolbar helpers ── */
function ToolBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 5, border: 'none', cursor: 'pointer',
        background: active ? '#3b82f6' : 'transparent',
        color: active ? '#fff' : '#475569',
        transition: 'background 120ms, color 120ms',
      }}
    >
      {children}
    </button>
  );
}

function HeadingBtn({ editor, level, label }: {
  editor: ReturnType<typeof useEditor>;
  level: 1 | 2 | 3;
  label: string;
}) {
  if (!editor) return null;
  const active = editor.isActive('heading', { level });
  return (
    <button
      onClick={() => (editor.chain().focus() as any).toggleHeading({ level }).run()}
      style={{
        padding: '0 6px', height: 26, borderRadius: 5, border: 'none',
        cursor: 'pointer', fontSize: 11, fontWeight: 600,
        fontFamily: 'Montserrat, sans-serif',
        background: active ? '#3b82f6' : 'transparent',
        color: active ? '#fff' : '#475569',
        transition: 'background 120ms, color 120ms',
      }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 3px' }} />;
}
