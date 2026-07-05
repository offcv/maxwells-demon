import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

export const startScan = (scan_paths: any) => api.post('/scan/start', { scan_paths });
export const getScanStatus = () => api.get('/scan/status');
export const cancelScan = () => api.post('/scan/cancel');

export const getSessions = () => api.get('/sessions/');
export const getSessionSummary = (id: string) => api.get(`/sessions/${id}/summary`);
export const getSessionGroups = (id: string, page: number) => api.get(`/sessions/${id}/groups?page=${page}`);

export const getFolderTree = (id: string, parent: string) => api.get(`/sessions/${id}/folders/tree?parent=${encodeURIComponent(parent)}`);
export const getFolderMarks = (id: string) => api.get(`/sessions/${id}/folders/marks`);
export const setFolderMark = (id: string, path: string, mark: string) => api.put(`/sessions/${id}/folders/mark`, { path, mark });
export const deleteFolderMark = (id: string, path: string) => api.delete(`/sessions/${id}/folders/mark?path=${encodeURIComponent(path)}`);

export const generateScheme = (id: string) => api.post(`/sessions/${id}/scheme/generate`);
export const getSchemeStatus = (id: string) => api.get(`/sessions/${id}/scheme/status`);
export const getSchemeCategories = (id: string) => api.get(`/sessions/${id}/scheme/categories`);
export const getCategoryGroups = (id: string, cat: string, page: number) => api.get(`/sessions/${id}/scheme/categories/${cat}/groups?page=${page}`);
export const updateFileAction = (id: string, path: string, action: string) => api.put(`/sessions/${id}/scheme/file-action`, { path, action });

export const moveToFolder = (id: string, category: string, dest_path: string) => api.post(`/sessions/${id}/action/move-to-folder`, { category, dest_path });
export const moveToTrash = (id: string, category: string) => api.post(`/sessions/${id}/action/move-to-trash`, { category });
export const cancelAction = (id: string) => api.post(`/sessions/${id}/action/cancel`);
export const getActionStatus = (id: string) => api.get(`/sessions/${id}/action/status`);

export const revealFile = (path: string) => api.post('/reveal-file', { path });
/** reveal-file 的后端实际路径为 /api/reveal-file，但 Vite proxy 会转发 /api -> backend */
export const deleteSession = (id: string) => api.delete(`/sessions/${id}`);
export const getUnreadableFiles = (id: string) => api.get(`/sessions/${id}/unreadable-files`);
export const browseFolder = (path: string) => api.get(`/folders/browse?path=${encodeURIComponent(path)}`);
export const getDefaultRoot = () => api.get('/folders/default-root');

export default api;
