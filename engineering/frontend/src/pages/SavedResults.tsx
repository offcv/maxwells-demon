import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { useSchemeStore } from '../store/schemeStore';
import { getSessions, getSessionSummary, deleteSession } from '../api';
import { ArrowLeft, Plus, Layers, HardDrive } from 'lucide-react';
import { formatDateTime } from '../utils/format';
import DialogModal from '../components/DialogModal';

interface SessionItem {
  id: string;
  scan_paths: string;
  status: string;
  scanned_total: number;
  file_count: number;
  group_count: number;
  total_size: number;
  reclaimable_size: number;
  created_at: string;
  finished_at: string | null;
  scan_duration_sec: number;
}

type DialogConfig = {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function SavedResults() {
  const navigate = useNavigate();
  const setSessionId = useScanStore(state => state.setSessionId);
  const setFinishedAt = useSchemeStore(state => state.setFinishedAt);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogConfig>({ isOpen: false, type: 'alert', title: '', message: '' });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  const loadSessions = async () => {
    try {
      const res = await getSessions();
      setSessions(res.data || []);
    } catch (e) {
      console.error('Failed to load sessions', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleLoad = (s: SessionItem) => {
    setSessionId(s.id);
    if (s.finished_at) {
      setFinishedAt(s.finished_at);
    }
    navigate('/scheme-category');
  };

  const handleDelete = async (s: SessionItem) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: '删除扫描记录',
      message: `确定要删除扫描记录 "${formatDateTime(s.created_at)}" 吗？`,
      onConfirm: async () => {
        closeDialog();
        try {
          await deleteSession(s.id);
          setSessions(prev => prev.filter(x => x.id !== s.id));
        } catch (e) {
          console.error('Failed to delete session', e);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: '提示',
            message: '删除失败'
          });
        }
      }
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
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
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#8E8E93' }}
        >
          <ArrowLeft size={16} />
          <span style={{ fontSize: 14 }}>返回首页</span>
        </div>
      </header>

      {/* Body */}
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        padding: '32px 64px',
        gap: 24
      }}>
        {/* Title Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>已保存的扫描结果</h1>
            <span style={{ fontSize: 14, color: '#8E8E93' }}>查看和管理您之前保存的扫描记录</span>
          </div>
          <button 
            className="btn-primary" 
            onClick={() => navigate('/new-scan')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              height: 40, 
              padding: '0 24px', 
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            新建扫描
            <Plus size={16} />
          </button>
        </div>

        {/* Table */}
        <div style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          border: '1px solid #D1D1D6',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden'
        }}>
          {/* Header Row */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            height: 48, 
            backgroundColor: '#F2F2F7', 
            padding: '0 16px',
            borderBottom: '1px solid #D1D1D6',
            fontSize: 13,
            fontWeight: 600,
            color: '#8E8E93',
            gap: 16
          }}>
            <div style={{ width: 220 }}>扫描时间</div>
            <div style={{ width: 220 }}>最后更新</div>
            <div style={{ width: 120 }}>相同文件</div>
            <div style={{ width: 140 }}>可释放空间</div>
            <div style={{ flex: 1 }} />
            <div style={{ width: 160, textAlign: 'center' }}>操作</div>
          </div>

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {sessions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8E8E93' }}>
                暂无扫描记录
              </div>
            ) : (
              sessions.map((s, idx) => (
                <div key={s.id} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  height: 56, 
                  padding: '0 16px',
                  borderBottom: idx < sessions.length - 1 ? '1px solid #D1D1D6' : 'none',
                  fontSize: 14,
                  gap: 16
                }}>
                  <div style={{ width: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatDateTime(s.created_at)}
                  </div>
                  <div style={{ width: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatDateTime(s.finished_at)}
                  </div>
                  <div style={{ width: 120 }}>
                    {s.group_count || 0} 组
                  </div>
                  <div style={{ width: 140, fontWeight: 600 }}>
                    {formatSize(s.reclaimable_size || 0)}
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ width: 160, display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button 
                      onClick={() => handleLoad(s)}
                      style={{
                        height: 28,
                        padding: '0 12px',
                        borderRadius: 6,
                        backgroundColor: 'var(--primary)',
                        color: '#FFFFFF',
                        fontSize: 13,
                        fontWeight: 500
                      }}
                    >
                      加载
                    </button>
                    <button 
                      onClick={() => handleDelete(s)}
                      style={{
                        height: 28,
                        padding: '0 12px',
                        borderRadius: 6,
                        backgroundColor: 'transparent',
                        border: '1px solid #D1D1D6',
                        color: '#8E8E93',
                        fontSize: 13,
                        fontWeight: 500
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
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
