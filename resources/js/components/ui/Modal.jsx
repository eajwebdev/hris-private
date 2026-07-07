import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape') onClose?.();
        }
        if (open) document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

    return createPortal(
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <motion.div
                        className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div
                        className={cn(
                            'relative w-full card-surface max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl',
                            widths[size]
                        )}
                        initial={{ opacity: 0, y: 24, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    >
                        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
                            <div>
                                <h2 className="text-lg font-semibold font-display">{title}</h2>
                                {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
                            </div>
                            <button onClick={onClose} className="text-muted hover:text-foreground p-1 -m-1" aria-label="Close">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-5">{children}</div>
                        {footer && <div className="flex items-center justify-end gap-2 p-5 pt-0">{footer}</div>}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading, danger = true }) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            size="sm"
            footer={
                <>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            <p className="text-sm text-muted">{message}</p>
        </Modal>
    );
}
