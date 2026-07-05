import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { useSchemeStore } from '../store/schemeStore';
import { getCategoryGroups, updateFileAction, getSchemeCategories } from '../api';
import { ArrowLeft, FolderOpen, Trash2, Check, X } from 'lucide-react';

export default function CategoryDetail() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const sessionId = useScanStore(state => state.sessionId);
  const categories = useSchemeStore(state => state.categories);
  const setCategories = useSchemeStore(state => state.setCategories);
  const setFinishedAt = useSchemeStore(state => state.setFinishedAt);
  
  const [groups, setGroups] = useState<any[]>([]);
  const [isGrayedOut, setIsGrayedOut] = useState(false);

  const loadData = async () => {
    if (!sessionId || !type) return;
    const res = await getCategoryGroups(sessionId, type, 1); 
    const groupsData = res.data.data || res.data || [];
    setGroups(groupsData);
    
    if (groupsData.length > 0) {
      const noFileSelected = !groupsData.some((g: any) => g.files.some((f: any) => f.action === 'delete'));
      const anyGroupFullyDeleted = groupsData.some((g: any) => g.files.every((f: any) => f.action === 'delete'));
      setIsGrayedOut(noFileSelected || anyGroupFullyDeleted);
    } else {
      setIsGrayedOut(true);
    }
  };

  useEffect(() => {
    loadData();
  }, [sessionId, type]);

  const handleActionChange = async (path: string, currentAction: string) => {
    if (!sessionId) return;
    const nextAction = currentAction === 'keep' ? 'delete' : 'keep';
    await updateFileAction(sessionId, path, nextAction);
    const d = new Date();
    setFinishedAt(d.toISOString());
    // Refresh local groups
    await loadData();
    // Refresh global categories so MoveToFolder/trash pages get correct stats
    try {
      const res = await getSchemeCategories(sessionId);
      setCategories(res.data);
    } catch (e) {
      console.error("Failed to refresh categories", e);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp * 1000);
    return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  if (!categories || !type || !categories[type]) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  const catData = categories[type];
  const titles: any = { keep_one: '只保留一个', partial_keep: '部分保留', keep_all: '全保留', delete_all: '全删除' };

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
          onClick={() => navigate('/scheme-category')}
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
        padding: '24px 32px',
        gap: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{titles[type]}</h1>
            <span style={{ fontSize: 14, color: '#8E8E93' }}>
              {catData.groups.length} 组, {catData.file_count} 文件待删除, 可释放 {formatSize(catData.size)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              className="btn-primary" 
              disabled={isGrayedOut}
              onClick={() => navigate('/move-folder', { state: { category: type } })}
              style={{ 
                height: 36, 
                padding: '0 16px', 
                borderRadius: 6, 
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <FolderOpen size={16} />
              移动到文件夹
            </button>
            <button 
              className="btn-danger" 
              disabled={isGrayedOut}
              onClick={() => navigate('/move-trash', { state: { category: type } })}
              style={{ 
                height: 36, 
                padding: '0 16px', 
                borderRadius: 6, 
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Trash2 size={16} />
              移动到废纸篓
            </button>
          </div>
        </div>

        <div style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          border: '1px solid #D1D1D6',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden'
        }}>
          {/* Table Header */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            height: 32, 
            backgroundColor: '#F2F2F7', 
            padding: '0 12px',
            borderBottom: '1px solid #D1D1D6',
            fontSize: 13,
            fontWeight: 600,
            color: '#8E8E93'
          }}>
            <div style={{ width: 50 }}>状态</div>
            <div style={{ width: 180 }}>文件名</div>
            <div style={{ width: 80 }}>大小</div>
            <div style={{ width: 140 }}>创建时间</div>
            <div style={{ width: 140 }}>修改时间</div>
            <div style={{ flex: 1 }}>路径</div>
            <div style={{ width: 40, textAlign: 'center' }}>打开</div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {groups.map(g => {
              const firstFileName = g.files.length > 0 ? g.files[0].path.split('/').pop() : '';
              return (
              <div key={g.group_id} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ 
                  height: 28, 
                  backgroundColor: '#F2F2F7', 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '0 12px',
                  borderBottom: '1px solid #E5E5EA',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#007AFF'
                }}>
                  组 #{g.group_id} - {firstFileName}
                  {g.files.every((f: any) => f.action === 'delete') && (
                    <span style={{ color: 'var(--danger)', marginLeft: 8, fontWeight: 'normal' }}>
                      (该组全部被删除，操作已被锁定)
                    </span>
                  )}
                </div>
                
                {g.files.map((f: any) => (
                  <div key={f.path} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    minHeight: 28, 
                    padding: '4px 12px',
                    borderBottom: '1px solid #E5E5EA',
                    fontSize: 13
                  }}>
                    <div style={{ width: 50, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {/* Checkbox-style status toggle */}
                      <div
                        onClick={() => handleActionChange(f.path, f.action)}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          backgroundColor: f.action === 'delete' ? '#007AFF' : '#FFFFFF',
                          border: f.action === 'delete' ? 'none' : '1px solid #D1D1D6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                          boxSizing: 'border-box'
                        }}
                      >
                        {f.action === 'delete' && (
                          <Check size={14} color="#FFFFFF" strokeWidth={3} />
                        )}
                      </div>
                      {f.mark_source_type === 'override' && (
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--warning)' }} title="手动调整" />
                      )}
                    </div>
                    <div style={{ width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.path.split('/').pop()}
                    </div>
                    <div style={{ width: 80, color: '#8E8E93' }}>{formatSize(f.size)}</div>
                    <div style={{ width: 140, color: '#8E8E93' }}>{formatDate(f.created_time)}</div>
                    <div style={{ width: 140, color: '#8E8E93' }}>{formatDate(f.modified_time)}</div>
                    <div style={{ flex: 1, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.mark_source}>
                      {f.path}
                    </div>
                    <div style={{ width: 40, display: 'flex', justifyContent: 'center' }}>
                      <FolderOpen size={16} color="var(--primary)" style={{ cursor: 'pointer' }} />
                    </div>
                  </div>
                ))}
              </div>
              );
            })}
            {groups.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: '#8E8E93' }}>没有需要处理的组</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
