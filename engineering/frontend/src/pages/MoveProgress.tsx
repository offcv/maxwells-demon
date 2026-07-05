import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { cancelAction, getActionStatus } from '../api';
import { X, Loader2 } from 'lucide-react';
import DialogModal from '../components/DialogModal';

interface Batch {
  id: number;
  total: number;
  done: number;
  current_file: string;
  status: string;
}

type DialogConfig = {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function MoveProgress() {
  const navigate = useNavigate();
  const sessionId = useScanStore(s => s.sessionId);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [actionType, setActionType] = useState<string>('move_to_folder');
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(1);
  const [cancelling, setCancelling] = useState(false);
  const completedRef = useRef(false);
  const [dialog, setDialog] = useState<DialogConfig>({ isOpen: false, type: 'alert', title: '', message: '' });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  const handleCancel = async () => {
    if (cancelling) return;
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: '取消移动',
      message: '确定要取消移动吗？',
      onConfirm: async () => {
        closeDialog();
        setCancelling(true);
        try {
          await cancelAction(sessionId!);
        } catch (e) {
          console.error('Cancel failed', e);
        }
      }
    });
  };

  useEffect(() => {
    if (completedRef.current) return;

    let ws: WebSocket;
    let pollInterval: any;
    
    const checkStatus = async () => {
      if (completedRef.current) return;
      try {
        const res = await getActionStatus(sessionId!);
        const data = res.data;
        if (!data || data.status === 'idle') return;
        
        setActionType(data.action || 'move_to_folder');
        setDone(data.done || 0);
        setTotal(data.total || 1);
        
        if (data.status === 'cancelled') {
          completedRef.current = true;
          if (ws) ws.close();
          if (pollInterval) clearInterval(pollInterval);
          navigate('/');
        } else if (data.status === 'done' || data.status === 'error') {
          completedRef.current = true;
          if (ws) ws.close();
          if (pollInterval) clearInterval(pollInterval);
          navigate('/moving-complete', {
            state: {
              actionType: data.action || 'move_to_folder',
              done: data.done || 0,
              total: data.total || 1,
              failed: data.failed || 0,
              size: data.total_size || 0
            }
          });
        }
      } catch (e) {
        console.error('Failed to poll action status', e);
      }
    };

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    ws = new WebSocket(`${protocol}//${host}/ws/action/progress`);

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setActionType(data.action || 'move_to_folder');
      setDone(data.done || 0);
      setTotal(data.total || 1);
      if (data.batches) {
        setBatches(data.batches);
      }
      if (data.status === 'cancelled') {
        completedRef.current = true;
        ws.close();
        if (pollInterval) clearInterval(pollInterval);
        navigate('/');
        return;
      }
      if (data.status === 'done' || (data.done >= data.total && data.total > 0)) {
        completedRef.current = true;
        ws.close();
        if (pollInterval) clearInterval(pollInterval);
        navigate('/moving-complete', {
          state: {
            actionType: data.action || 'move_to_folder',
            done: data.done || 0,
            total: data.total || 1,
            failed: data.failed || 0,
            size: data.total_size || 0
          }
        });
      }
    };

    ws.onerror = () => {
      console.error('WebSocket error on action progress');
    };

    pollInterval = setInterval(checkStatus, 1000);

    return () => {
      if (ws) ws.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [navigate, sessionId]);

  const percent = total ? (done / total) * 100 : 0;
  const titleText = actionType === 'move_to_trash' ? '正在移动到废纸篓…' : '正在移动到文件夹...';

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
          onClick={cancelling ? undefined : handleCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: cancelling ? 'default' : 'pointer', color: '#8E8E93', opacity: cancelling ? 0.5 : 1 }}
        >
          {cancelling ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={16} />}
          <span style={{ fontSize: 14 }}>{cancelling ? '正在取消...' : '取消移动'}</span>
        </div>
      </header>

      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        padding: '32px 48px',
        gap: 32
      }}>
        {/* Title section */}
        <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#000000' }}>{titleText}</div>
          <div style={{ fontSize: 14, color: '#8E8E93' }}>执行中，请等待</div>
        </div>

        {/* Progress card */}
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
          {batches.length === 0 ? (
            /* Simple progress when no batch data */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>进度</span>
                <span style={{ fontSize: 14 }}>{done}/{total}</span>
              </div>
              <div style={{ width: '100%', height: 4, backgroundColor: '#D1D1D6', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${percent}%`, height: '100%', backgroundColor: '#007AFF', borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
            </div>
          ) : (
            batches.map(b => (
              <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Batch label */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ 
                    fontSize: 14, 
                    fontWeight: b.status === 'running' || b.status === 'done' ? 600 : 'normal',
                    color: b.status === 'running' || b.status === 'done' ? '#000000' : '#AEAEB2'
                  }}>
                    批次 {b.id}
                  </span>
                  <span style={{ 
                    fontSize: 14, 
                    color: b.status === 'running' || b.status === 'done' ? '#000000' : '#AEAEB2'
                  }}>
                    {b.status === 'pending' ? '待执行' : `${b.done}/${b.total}`}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ width: '100%', height: 4, backgroundColor: '#D1D1D6', borderRadius: 4, overflow: 'hidden' }}>
                  {b.status !== 'pending' && (
                    <div style={{ 
                      width: `${b.total ? (b.done / b.total) * 100 : 0}%`, 
                      height: '100%', 
                      backgroundColor: '#007AFF', 
                      borderRadius: 4,
                      transition: 'width 0.3s'
                    }} />
                  )}
                </div>
                {/* Current file */}
                {b.current_file && (
                  <span style={{ fontSize: 13, color: '#AEAEB2' }}>
                    当前: {b.current_file.split('/').pop()}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </main>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

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
