import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { useSchemeStore } from '../store/schemeStore';
import { getSchemeCategories } from '../api';
import { ArrowLeft, Info } from 'lucide-react';
import { formatDateTime } from '../utils/format';

export default function SchemeCategory() {
  const navigate = useNavigate();
  const sessionId = useScanStore(state => state.sessionId);
  const { categories, finishedAt, setCategories } = useSchemeStore();

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }
    // Refresh to get latest manual overrides
    getSchemeCategories(sessionId).then(res => setCategories(res.data));
  }, [sessionId, setCategories]);

  if (!categories) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const cards = [
    { key: 'keep_one', title: '只保留一个', desc: '标记清晰，可清理', color: 'var(--primary)' },
    { key: 'partial_keep', title: '部分保留', desc: '保留项不唯一，需手动调整', color: 'var(--warning)' },
    { key: 'keep_all', title: '全保留', desc: '无可清理项，需手动调整', color: 'var(--warning)' },
    { key: 'delete_all', title: '全删除', desc: '缺少保留项，需手动调整', color: 'var(--warning)' }
  ];

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div 
            onClick={() => navigate('/folder-marking')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#8E8E93' }}
          >
            <ArrowLeft size={16} />
            <span style={{ fontSize: 14 }}>返回重新标记</span>
          </div>
          <div 
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#8E8E93' }}
          >
            <span style={{ fontSize: 14 }}>返回首页</span>
          </div>
        </div>
      </header>

      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        padding: '24px 32px',
        gap: 24
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>清理方案分类</h1>
            <span style={{ fontSize: 14, color: '#8E8E93' }}>标记策略产生四类处理方案，所有处理操作将实时保存</span>
          </div>
          <span style={{ color: '#8E8E93', fontSize: 14 }}>{formatDateTime(finishedAt)} 已保存</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {cards.map(c => {
            const data = categories[c.key] || { groups: [], file_count: 0, size: 0, total_file_count: 0, total_size: 0 };
            return (
              <div 
                key={c.key} 
                style={{ 
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  border: '1px solid #D1D1D6',
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 6, backgroundColor: c.color }} />
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#000000' }}>{c.title}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#8E8E93' }}>{c.desc}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: c.color }}>{data.groups.length} 组</div>
                  <div style={{ fontSize: 14, color: '#8E8E93' }}>{data.file_count}/{data.total_file_count} 文件</div>
                  <div style={{ fontSize: 14, color: '#8E8E93' }}>{formatSize(data.size)}/{formatSize(data.total_size)}</div>
                </div>

                <button 
                  onClick={() => navigate(`/category/${c.key}`)}
                  style={{ 
                    height: 36, 
                    borderRadius: 6, 
                    backgroundColor: c.color, 
                    color: '#FFFFFF', 
                    fontWeight: 600,
                    fontSize: 14,
                    marginTop: 'auto',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  处理此分类
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Info size={16} color="var(--warning)" />
          <span style={{ color: 'var(--warning)', fontSize: 13 }}>调整项较多时，返回重新标记更高效</span>
        </div>
      </main>
    </div>
  );
}
