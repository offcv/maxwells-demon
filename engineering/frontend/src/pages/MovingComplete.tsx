import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

export default function MovingComplete() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const actionType = state?.actionType || 'move_to_folder';
  const done = state?.done ?? 0;
  const total = state?.total ?? 1;
  const failed = state?.failed ?? 0;
  const size = state?.size ?? 0;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const successCount = done - failed;
  const successSize = total > 0 ? (size * successCount / total) : 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav — only 麦克斯韦妖, no back button */}
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
      </header>

      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 48px',
        gap: 32
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
          padding: 32,
          alignItems: 'center'
        }}>
          {/* Green check icon */}
          <div style={{
            width: 56,
            height: 56,
            backgroundColor: '#34C759',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CheckCircle size={32} color="#FFFFFF" />
          </div>

          {/* Title */}
          <div style={{ fontSize: 22, fontWeight: 600, color: '#000000', textAlign: 'center' }}>
            移动完成
          </div>

          {/* Stats */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#8E8E93', fontSize: 15 }}>成功移动</span>
              <span style={{ color: '#8E8E93', fontSize: 15, fontWeight: 600 }}>
                {successCount} 个文件{successSize > 0 ? ` (${formatSize(successSize)})` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#8E8E93', fontSize: 15 }}>移动失败</span>
              <span style={{ color: '#8E8E93', fontSize: 15, fontWeight: 600 }}>
                {failed} 个文件
              </span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: '100%', height: 1, backgroundColor: '#D1D1D6' }} />

          {/* Note */}
          {failed > 0 && (
            <div style={{ fontSize: 13, color: '#AEAEB2', textAlign: 'center' }}>
              失败文件已记录，可重试
            </div>
          )}

          {/* Button */}
          <button
            onClick={() => navigate('/scheme-category')}
            style={{
              height: 40,
              padding: '0 32px',
              borderRadius: 6,
              backgroundColor: '#007AFF',
              color: '#FFFFFF',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            返回清理方案分类
          </button>
        </div>
      </main>
    </div>
  );
}
