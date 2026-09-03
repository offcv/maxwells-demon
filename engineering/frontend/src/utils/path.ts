/**
 * 路径翻译与剪贴板工具
 *
 * NAS 部署时软件内部记录的是容器路径（如 /mnt/nas/homes/...），
 * 用户在 File Station 中需要的是宿主机路径（如 /volume1/homes/...）。
 * 复制路径前按后端下发的映射规则做前缀转换。
 */

export interface RuntimeConfig {
  docker_mode: boolean;
  nas_root: string;
  host_nas_path: string;
}

/** 容器内路径 → 宿主机路径（无映射规则或前缀不匹配时原样返回） */
export function translatePath(path: string, cfg: RuntimeConfig | null | undefined): string {
  if (!cfg || !cfg.host_nas_path || !cfg.nas_root) return path;
  if (path.startsWith(cfg.nas_root)) {
    const host = cfg.host_nas_path.replace(/\/+$/, "");
    return host + path.slice(cfg.nas_root.length);
  }
  return path;
}

/** 复制文本到剪贴板（NAS 场景多为 http 非安全上下文，含降级方案） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
