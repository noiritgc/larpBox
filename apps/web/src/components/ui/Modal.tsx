import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Native modal dialog: the browser traps focus in the top layer. Escape closes noncritical
 * dialogs only, and focus returns to whatever opened the dialog.
 */
export function Modal({
  open,
  title,
  children,
  onClose,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      dialog.close();
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    const onCancel = (event: Event) => {
      event.preventDefault();
      if (dismissible) onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [dismissible, onClose]);

  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId}>
      {open ? (
        <div className="modal-body">
          <h2 id={titleId} className="display text-[28px]">
            {title}
          </h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
