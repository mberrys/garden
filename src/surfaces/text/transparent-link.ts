import Link from "@tiptap/extension-link";
import { isSafeHref } from "@/lib/text/safe-href";

/**
 * Links that show their destination before you click and open in a new tab when
 * you do — no surprise navigations inside the editor.
 */
export const TransparentLink = Link.extend({
  addAttributes() {
    const parent = this.parent?.();
    return {
      ...parent,
      title: {
        default: null,
        renderHTML: (attributes) => {
          const href = attributes.href as string | null | undefined;
          return href ? { title: href } : {};
        },
      },
    };
  },
});

export function configureTransparentLink() {
  return TransparentLink.configure({
    autolink: true,
    openOnClick: true,
    linkOnPaste: true,
    HTMLAttributes: {
      target: "_blank",
      rel: "noopener noreferrer",
      class: "rr-link",
    },
    validate: (url) => isSafeHref(url),
  });
}
