import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import SmartFieldNodeView from './SmartFieldNodeView';

export interface SmartFieldAttrs {
  field: string;
  label: string;
  value: string;
  placeholder: string;
}

const SmartFieldExtension = Node.create<Record<string, never>>({
  name: 'smartField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      field: { default: '' },
      label: { default: '' },
      value: { default: '' },
      placeholder: { default: '···' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-smart-field]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            field: el.getAttribute('data-field') ?? '',
            label: el.getAttribute('data-label') ?? '',
            value: el.getAttribute('data-value') ?? '',
            placeholder: el.getAttribute('data-placeholder') ?? '···',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-smart-field': '',
        'data-field': node.attrs.field,
        'data-label': node.attrs.label,
        'data-value': node.attrs.value,
        'data-placeholder': node.attrs.placeholder,
        class: 'smart-field-token',
      }),
      node.attrs.value || node.attrs.placeholder || '···',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SmartFieldNodeView);
  },
});

export default SmartFieldExtension;
