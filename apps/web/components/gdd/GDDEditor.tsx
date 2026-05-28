'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'
import './GDDEditor.css'

interface GDDEditorProps {
  content: string
  onChange: (content: string) => void
}

export function GDDEditor({ content, onChange }: GDDEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing, or generate this section with AI above…',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'gdd-editor prose prose-invert max-w-none focus:outline-none min-h-[400px]',
      },
    },
  })

  // Sync content when section changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  if (!editor) return null

  return (
    <div className="flex flex-col gap-3">
      {/* Formatting toolbar */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 flex-wrap">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <div className="w-px h-4 bg-zinc-800 mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          H3
        </ToolbarButton>
        <div className="w-px h-4 bg-zinc-800 mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          •—
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          1.
        </ToolbarButton>
        <div className="w-px h-4 bg-zinc-800 mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title="Code block"
        >
          {'</>'}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Blockquote"
        >
          &ldquo;&rdquo;
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl px-6 py-5">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
        active
          ? 'bg-yellow-400/20 text-yellow-400'
          : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  )
}
