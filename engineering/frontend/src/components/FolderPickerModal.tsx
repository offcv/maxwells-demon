import React, { useState, useEffect } from 'react';
import { X, Folder, ChevronRight, ArrowLeft } from 'lucide-react';
import { browseFolder, getDefaultRoot } from '../api';

interface FolderPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  title?: string;
  initialPath?: string;
}

export default function FolderPickerModal({ 
  isOpen, 
  onClose, 
  onSelect, 
  title = "选择文件夹",
  initialPath = '/' 
}: FolderPickerModalProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [folders, setFolders] = useState<{name: string, path: string}[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    browseFolder(currentPath)
      .then(res => {
        setFolders(res.data);
      })
      .catch(err => {
        console.error("Failed to load folders", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, currentPath]);

  // Reset state when opening modal
  useEffect(() => {
    if (isOpen) {
      const savedPath = localStorage.getItem('last_scan_path');
      // Ignore cached '/' so that the new default root logic can kick in
      if (savedPath && savedPath !== '/') {
        setCurrentPath(savedPath);
      } else {
        getDefaultRoot().then(res => {
          setCurrentPath(res.data.root);
        }).catch(() => {
          setCurrentPath(initialPath);
        });
      }
    }
  }, [isOpen, initialPath]);

  if (!isOpen) return null;

  const handleGoUp = () => {
    if (currentPath === '/' || currentPath.match(/^[a-zA-Z]:\\$/)) return;
    
    // Check if path uses backslashes (Windows) or forward slashes (Unix)
    const separator = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(separator).filter(Boolean);
    parts.pop();
    
    let newPath = '';
    if (separator === '\\') {
      newPath = parts.join('\\');
      // If it's just the drive letter left, add trailing slash (e.g. C:\)
      if (newPath.match(/^[a-zA-Z]:$/)) {
        newPath += '\\';
      } else if (!newPath) {
        newPath = '/'; // Fallback to root if completely empty
      }
    } else {
      newPath = '/' + parts.join('/');
    }
    
    setCurrentPath(newPath || '/');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        width: 540,
        height: 600,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
      }}>
        {/* Header */}
        <div style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '1px solid #D1D1D6',
          backgroundColor: '#F2F2F7',
          flexShrink: 0
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
            <X size={20} color="#8E8E93" />
          </button>
        </div>

        {/* Path Nav */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid #D1D1D6',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0
        }}>
          <button 
            onClick={handleGoUp}
            disabled={currentPath === '/' || /^[a-zA-Z]:\\$/.test(currentPath)}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              cursor: (currentPath === '/' || /^[a-zA-Z]:\\$/.test(currentPath)) ? 'not-allowed' : 'pointer', 
              display: 'flex',
              padding: 4,
              color: (currentPath === '/' || /^[a-zA-Z]:\\$/.test(currentPath)) ? '#D1D1D6' : 'var(--primary, #007AFF)'
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ 
            flex: 1, 
            fontSize: 14, 
            backgroundColor: '#F2F2F7', 
            padding: '8px 12px', 
            borderRadius: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#3A3A3C'
          }}>
            {currentPath}
          </div>
        </div>

        {/* Folder List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8E8E93', fontSize: 14 }}>加载目录中...</div>
          ) : folders.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8E8E93', fontSize: 14 }}>空文件夹</div>
          ) : (
            folders.map((f, i) => (
              <div 
                key={i}
                onClick={() => setCurrentPath(f.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 20px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #F2F2F7',
                  gap: 12
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F2F2F7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Folder size={20} color="var(--primary, #007AFF)" fill="var(--primary, #007AFF)" style={{ opacity: 0.8 }} />
                <span style={{ fontSize: 14, flex: 1 }}>{f.name}</span>
                <ChevronRight size={16} color="#C7C7CC" />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #D1D1D6',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          flexShrink: 0
        }}>
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
          <button 
            onClick={() => { 
              localStorage.setItem('last_scan_path', currentPath);
              onSelect(currentPath); 
              onClose(); 
            }}
            style={{
              height: 36,
              padding: '0 20px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'var(--primary, #007AFF)',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            选择此目录
          </button>
        </div>
      </div>
    </div>
  );
}
