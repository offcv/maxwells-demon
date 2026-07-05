import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { useSchemeStore } from '../store/schemeStore';
import { moveToFolder } from '../api';
import { ArrowLeft, FolderOpen, ArrowRight } from 'lucide-react';
import FolderPickerModal from '../components/FolderPickerModal';
import DialogModal from '../components/DialogModal';

type DialogConfig = {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function MoveToFolder() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const sessionId = useScanStore(s => s.sessionId);
  const categories = useSchemeStore(s => s.categories);
  const [destPath, setDestPath] = useState('/mnt/nas/backup');
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const handleBrowse = () => {
    setIsModalOpen(true);
  };

  const handleFolderSelect = (path: string) => {
    if (path) {
      setDestPath(path.trim());
    }
  };

  const handleMove = async () => {
    if (!sessionId || !destPath) return;
    try {
      await moveToFolder(sessionId, state.category, destPath);
      navigate('/move-progress');
    } catch (e) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: '提示',
        message: '无法启动移动任务'
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
            <FolderOpen size={24} color="#007AFF" />
          </div>

          {/* Title */}
          <div style={{ fontSize: 20, fontWeight: 600, color: '#000000' }}>移动到文件夹</div>

          {/* File info */}
          <div style={{ fontSize: 14, fontWeight: 600, color: '#8E8E93' }}>
            待移动文件: {catData.file_count} 个, 共 {formatSize(catData.size)}
          </div>

          {/* Path label */}
          <div style={{ fontSize: 14, fontWeight: 600, color: '#000000' }}>目标文件夹路径</div>

          {/* Path input row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1,
              height: 44,
              borderRadius: 6,
              border: '1px solid #D1D1D6',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 14,
              color: '#007AFF'
            }}>
              {destPath}
            </div>
            <button
              onClick={handleBrowse}
              style={{
                height: 44,
                padding: '0 16px',
                borderRadius: 6,
                backgroundColor: '#007AFF',
                color: '#FFFFFF',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <FolderOpen size={16} />
              选择文件夹
            </button>
          </div>

          {/* Confirm button */}
          <button
            onClick={handleMove}
            disabled={!destPath || catData.file_count === 0}
            style={{
              height: 40,
              padding: '0 24px',
              borderRadius: 6,
              backgroundColor: (destPath && catData.file_count > 0) ? '#007AFF' : '#D1D1D6',
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              alignSelf: 'flex-start',
              cursor: (destPath && catData.file_count > 0) ? 'pointer' : 'not-allowed'
            }}
          >
            <ArrowRight size={16} />
            确认移动
          </button>
        </div>
      </main>

      <FolderPickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={(path) => {
          handleFolderSelect(path);
          setIsModalOpen(false);
        }}
        title="选择目标文件夹"
        initialPath={destPath}
      />
      
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
