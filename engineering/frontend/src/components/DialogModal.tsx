import React from 'react';

interface DialogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  type?: 'alert' | 'confirm';
}

export default function DialogModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  type = 'alert' 
}: DialogModalProps) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        width: 420,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 24px 12px',
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#000000' }}>{title}</h3>
        </div>

        {/* Content */}
        <div style={{
          padding: '0 24px 24px',
          fontSize: 15,
          color: '#3A3A3C',
          lineHeight: 1.5
        }}>
          {message}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          backgroundColor: '#F2F2F7',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          borderTop: '1px solid #E5E5EA'
        }}>
          {type === 'confirm' && (
            <button 
              onClick={onClose}
              style={{
                height: 36,
                padding: '0 20px',
                borderRadius: 6,
                border: '1px solid #D1D1D6',
                backgroundColor: '#FFFFFF',
                color: '#000000',
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              取消
            </button>
          )}
          <button 
            onClick={() => {
              if (onConfirm) onConfirm();
              else onClose();
            }}
            style={{
              height: 36,
              padding: '0 24px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: '#007AFF',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}