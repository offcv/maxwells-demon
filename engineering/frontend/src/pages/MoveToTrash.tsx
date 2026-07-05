import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { useSchemeStore } from '../store/schemeStore';
import { moveToTrash } from '../api';
import { ArrowLeft, AlertTriangle, ArrowRight, Trash2 } from 'lucide-react';
import DialogModal from '../components/DialogModal';

type DialogConfig = {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function MoveToTrash() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const sessionId = useScanStore(s => s.sessionId);
  const categories = useSchemeStore(s => s.categories);
  const [dialog, setDialog] = useState<DialogConfig>({ isOpen: false, type: 'alert', title: '', message: '' });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  if (!state || !categories) return <div>Invalid state</div>;
  const catData = categories[state.category];

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const handleMove = async () => {
    if (!sessionId) return;
    try {
      await moveToTrash(sessionId, state.category);
      navigate('/move-progress');
    } catch (e) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: '提示',
        message: '无法启动删除任务'
      });
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        height: 64, 
        backgroundColor: '#FFFFFF', 
        padding: '0 32px', 
        display: 'flex', 
        alignItems: 'center',
        borderBottom: '1px solid #D1D1D6',
        flexShrink: 0
      }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>麦克斯韦妖</div>
        <div style={{ flex: 1 }} />
        <div 
          onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#8E8E93' }}
        >
          <ArrowLeft size={16} />
          <span style={{ fontSize: 14 }}>返回上一页</span>
        </div>
      </header>

      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '32px 48px'
      }}>
        <div style={{ 
          width: '100%',
          maxWidth: 600,
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #D1D1D6',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          padding: 32
        }}>
          {/* Icon */}
          <div style={{
            width: 48,
            height: 48,
            backgroundColor: '#F2F2F7',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Trash2 size={24} color="#007AFF" />
          </div>

          {/* Title */}
          <div style={{ fontSize: 20, fontWeight: 600, color: '#000000' }}>移动到废纸篓</div>

          {/* File info */}
          <div style={{ fontSize: 14, fontWeight: 600, color: '#8E8E93' }}>
            待删除文件: {catData.file_count} 个, 共 {formatSize(catData.size)}
          </div>

          {/* Warning box */}
          <div style={{
            backgroundColor: '#F2F2F7',
            borderRadius: 6,
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertTriangle size={16} color="#FF9500" />
            <span style={{ color: '#FF9500', fontSize: 13 }}>文件将移动到系统废纸篓</span>
          </div>

          {/* Confirm button */}
          <button
            onClick={handleMove}
            style={{
              height: 40,
              padding: '0 24px',
              borderRadius: 6,
              backgroundColor: '#007AFF',
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              alignSelf: 'flex-start',
              cursor: 'pointer'
            }}
          >
            <ArrowRight size={16} />
            确认删除
          </button>
        </div>
      </main>

      <DialogModal
        isOpen={dialog.isOpen}
        onClose={closeDialog}
        onConfirm={dialog.onConfirm}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
      />
    </div>
  );
}
