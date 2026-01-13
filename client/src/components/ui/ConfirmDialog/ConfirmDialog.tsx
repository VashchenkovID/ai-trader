import React from 'react';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  visible: boolean;
  message: string;
  header?: string;
  icon?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  acceptClassName?: string;
  rejectClassName?: string;
  onAccept: () => void;
  onReject: () => void;
  acceptIcon?: string;
  rejectIcon?: string;
  blockScroll?: boolean;
  dismissableMask?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  message,
  header = 'Подтверждение',
  icon,
  acceptLabel = 'Да',
  rejectLabel = 'Нет',
  acceptClassName = '',
  rejectClassName = '',
  onAccept,
  onReject,
  acceptIcon = 'pi pi-check',
  rejectIcon = 'pi pi-times',
  blockScroll = true,
  dismissableMask = true,
}) => {
  return (
    <Modal
      isOpen={visible}
      onClose={onReject}
      title={header}
      size="sm"
      blockScroll={blockScroll}
      dismissableMask={dismissableMask}
    >
      <div className="confirm-dialog-content">
        {icon && (
          <div className="confirm-dialog-icon">
            <i className={icon}></i>
          </div>
        )}
        <div className="confirm-dialog-message">{message}</div>
        <div className="confirm-dialog-actions">
          <Button
            variant="ghost"
            size="md"
            onClick={onReject}
            className={rejectClassName}
          >
            {rejectLabel}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={onAccept}
            className={acceptClassName}
          >
            {acceptLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Глобальная функция для показа диалога подтверждения (аналог confirmDialog из PrimeReact)
let globalConfirmDialogRef: {
  show: (options: Omit<ConfirmDialogProps, 'visible' | 'onAccept' | 'onReject'> & {
    accept?: () => void;
    reject?: () => void;
  }) => void;
  hide: () => void;
} | null = null;

export const setConfirmDialogRef = (ref: typeof globalConfirmDialogRef) => {
  globalConfirmDialogRef = ref;
};

export const confirmDialog = (options: {
  message: string;
  header?: string;
  icon?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  accept?: () => void;
  reject?: () => void;
  acceptClassName?: string;
  rejectClassName?: string;
  acceptIcon?: string;
  rejectIcon?: string;
}) => {
  if (globalConfirmDialogRef) {
    globalConfirmDialogRef.show({
      ...options,
      onAccept: options.accept || (() => {}),
      onReject: options.reject || (() => {}),
    });
  } else {
    // Fallback на стандартный confirm, если компонент не инициализирован
    if (window.confirm(options.message)) {
      options.accept?.();
    } else {
      options.reject?.();
    }
  }
};

export default ConfirmDialog;

