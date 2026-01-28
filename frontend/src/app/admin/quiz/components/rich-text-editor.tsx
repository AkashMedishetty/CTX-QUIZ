/**
 * Rich Text Editor Component - TipTap-based editor
 * 
 * A neumorphic styled rich text editor using TipTap.
 * Supports basic formatting: bold, italic, bullet lists, numbered lists.
 * 
 * Requirements: 1.2
 */

'use client';

import * as React from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '@/lib/utils';

/**
 * Toolbar button component
 */
interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({ onClick, isActive, disabled, children, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-2 rounded-md transition-all duration-fast min-w-[36px] min-h-[36px]',
        'flex items-center justify-center',
        isActive
          ? 'bg-primary text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
          : 'bg-[var(--neu-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
        !isActive && 'shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
        !isActive && 'hover:shadow-[1px_1px_2px_var(--shadow-dark),-1px_-1px_2px_var(--shadow-light)]',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Editor toolbar component
 */
interface EditorToolbarProps {
  editor: Editor | null;
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--border)] bg-[var(--neu-surface)] rounded-t-md">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <ItalicIcon />
      </ToolbarButton>
      <div className="w-px h-6 bg-[var(--border)] mx-1 self-center" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <BulletListIcon />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <NumberedListIcon />
      </ToolbarButton>
      <div className="w-px h-6 bg-[var(--border)] mx-1 self-center" />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <UndoIcon />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Y)"
      >
        <RedoIcon />
      </ToolbarButton>
    </div>
  );
}

// Icons
function BoldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <text x="3" y="7" fontSize="8" fill="currentColor" stroke="none">1</text>
      <text x="3" y="13" fontSize="8" fill="currentColor" stroke="none">2</text>
      <text x="3" y="19" fontSize="8" fill="currentColor" stroke="none">3</text>
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  );
}

/**
 * Rich Text Editor Props
 */
export interface RichTextEditorProps {
  /** Current content (HTML string) */
  value?: string;
  /** Callback when content changes */
  onChange?: (html: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Minimum height */
  minHeight?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Rich Text Editor Component
 * 
 * A neumorphic styled rich text editor using TipTap.
 * 
 * @example
 * ```tsx
 * <RichTextEditor
 *   label="Question Text"
 *   value={questionText}
 *   onChange={setQuestionText}
 *   placeholder="Enter your question..."
 * />
 * ```
 */
export function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Start typing...',
  label,
  error,
  helperText,
  minHeight = '120px',
  disabled = false,
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false, // Prevent SSR hydration mismatch
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // Update editor content when value prop changes externally
  React.useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  // Update editable state when disabled changes
  React.useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  const inputId = React.useId();

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-body-sm font-medium text-[var(--text-primary)] mb-2"
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          'rounded-md overflow-hidden',
          'shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]',
          'bg-[var(--neu-bg)]',
          'transition-all duration-fast',
          error && 'ring-2 ring-error ring-offset-2',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <EditorToolbar editor={editor} />
        <EditorContent
          id={inputId}
          editor={editor}
          className={cn(
            'prose prose-sm max-w-none',
            'p-4',
            '[&_.ProseMirror]:outline-none',
            '[&_.ProseMirror]:min-h-[var(--min-height)]',
            '[&_.ProseMirror.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
            '[&_.ProseMirror.is-editor-empty:first-child::before]:text-[var(--text-muted)]',
            '[&_.ProseMirror.is-editor-empty:first-child::before]:float-left',
            '[&_.ProseMirror.is-editor-empty:first-child::before]:h-0',
            '[&_.ProseMirror.is-editor-empty:first-child::before]:pointer-events-none',
            '[&_.ProseMirror_p]:my-2',
            '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5',
            '[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5',
            '[&_.ProseMirror_li]:my-1'
          )}
          style={{ '--min-height': minHeight } as React.CSSProperties}
        />
      </div>
      {error && (
        <p className="mt-2 text-body-sm text-error" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="mt-2 text-body-sm text-[var(--text-muted)]">
          {helperText}
        </p>
      )}
    </div>
  );
}

export default RichTextEditor;
