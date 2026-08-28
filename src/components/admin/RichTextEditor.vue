<template>
  <div class="rich-editor border border-base-300 rounded-lg overflow-hidden flex flex-col">
    <!-- Toolbar -->
    <div class="flex flex-wrap gap-1 p-2 bg-base-200 border-b border-base-300">
      <button type="button" class="btn btn-xs btn-ghost font-bold" :class="{ 'btn-active': editor?.isActive('bold') }" @click="editor?.chain().focus().toggleBold().run()" title="Negrita">B</button>
      <button type="button" class="btn btn-xs btn-ghost italic" :class="{ 'btn-active': editor?.isActive('italic') }" @click="editor?.chain().focus().toggleItalic().run()" title="Cursiva">I</button>
      <button type="button" class="btn btn-xs btn-ghost line-through" :class="{ 'btn-active': editor?.isActive('strike') }" @click="editor?.chain().focus().toggleStrike().run()" title="Tachado">S</button>
      <div class="w-px bg-base-300 mx-1"></div>
      <button type="button" class="btn btn-xs btn-ghost" :class="{ 'btn-active': editor?.isActive('heading', { level: 2 }) }" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()" title="H2">H2</button>
      <button type="button" class="btn btn-xs btn-ghost" :class="{ 'btn-active': editor?.isActive('heading', { level: 3 }) }" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()" title="H3">H3</button>
      <div class="w-px bg-base-300 mx-1"></div>
      <button type="button" class="btn btn-xs btn-ghost" :class="{ 'btn-active': editor?.isActive('bulletList') }" @click="editor?.chain().focus().toggleBulletList().run()" title="Lista">≡</button>
      <button type="button" class="btn btn-xs btn-ghost" :class="{ 'btn-active': editor?.isActive('orderedList') }" @click="editor?.chain().focus().toggleOrderedList().run()" title="Lista numerada">1.</button>
      <button type="button" class="btn btn-xs btn-ghost" :class="{ 'btn-active': editor?.isActive('blockquote') }" @click="editor?.chain().focus().toggleBlockquote().run()" title="Cita">"</button>
      <button type="button" class="btn btn-xs btn-ghost font-mono" :class="{ 'btn-active': editor?.isActive('code') }" @click="editor?.chain().focus().toggleCode().run()" title="Código">&lt;/&gt;</button>
      <div class="w-px bg-base-300 mx-1"></div>
      <button type="button" class="btn btn-xs btn-ghost" @click="setLink" title="Enlace">🔗</button>
      <button type="button" class="btn btn-xs btn-ghost" @click="editor?.chain().focus().unsetLink().run()" :disabled="!editor?.isActive('link')" title="Quitar enlace">✕🔗</button>
      <div class="w-px bg-base-300 mx-1"></div>
      <button type="button" class="btn btn-xs btn-ghost" @click="editor?.chain().focus().undo().run()" title="Deshacer">↩</button>
      <button type="button" class="btn btn-xs btn-ghost" @click="editor?.chain().focus().redo().run()" title="Rehacer">↪</button>
    </div>

    <!--
      Editor area.

      The typographic classes and the height go on ProseMirror's own element via `editorProps`,
      not on this wrapper. `editor-content` renders a plain div around a contenteditable that is
      only as tall as its content: with the height out here, everything below the first line was
      dead space that swallowed clicks instead of putting the caret in the document.
    -->
    <editor-content :editor="editor" class="flex-1" />
  </div>
</template>

<script setup lang="ts">
import { watch, onBeforeUnmount } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit,
    Link.configure({ openOnClick: false }),
  ],
  editorProps: {
    attributes: { class: "prose prose-sm max-w-none p-4 min-h-48" },
  },
  onUpdate({ editor }) {
    emit("update:modelValue", editor.getHTML());
  },
});

watch(
  () => props.modelValue,
  (val) => {
    if (editor.value && editor.value.getHTML() !== val) {
      editor.value.commands.setContent(val, false);
    }
  }
);

function setLink() {
  const prev = editor.value?.getAttributes("link").href ?? "";
  const url = prompt("URL del enlace:", prev);
  if (url === null) return;
  if (url === "") {
    editor.value?.chain().focus().unsetLink().run();
  } else {
    editor.value?.chain().focus().setLink({ href: url }).run();
  }
}

onBeforeUnmount(() => editor.value?.destroy());
</script>
