# 麦克斯韦妖 (Maxwell's Demon) 👿

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Docker Support](https://img.shields.io/badge/docker-ready-2496ED.svg)](https://www.docker.com/)

[English](README_EN.md) | 简体中文

**麦克斯韦妖** 是一款专业的**重复文件扫描与清理工具**。它彻底颠覆了传统软件清理重复文件时带来的“心智负担”与“文件失踪恐慌”。

---

## ✨ 为什么选择麦克斯韦妖？(核心痛点解决)

**痛点：** 传统的重复文件清理软件在扫出海量文件后，通常只提供两种糟糕的清理方式：
1. 让用户在成千上万的文件列表中**手动逐一打勾**（耗时且令人崩溃）。
2. 提供“保留最新”或“保留最旧”的自动化清理，但这往往会**破坏你的目录结构习惯**。它可能会把文件保留在一个你根本不常用的备份文件夹里，反而删除了你精心整理的“常用工作目录”下的副本，导致你日后根本找不到文件。

**我们的解决方案：创新的「基于目录层级的标记规则」**
麦克斯韦妖允许你**以文件夹为单位**制定策略。你只需为自己整理好的常用文件夹标记为“保留”，并把那些杂乱的下载目录或备份目录标记为“删除”。
系统会自动将规则向下继承给内部的所有子文件。这意味着，**你的文件将始终留在你期望它们存在的目录结构中**，而多余的副本会被精准剔除！

## 🛠️ 其他技术特性

- 🛡️ **安全至上的智能分类与红线防误删**：
  - 在你标记完文件夹后，系统会自动将扫描结果划分为：“只保留一个”、“部分保留”、“全保留”、“全删除”四类。
  - **红线机制**：如果某一组重复文件中，按照你的文件夹规则，没有哪怕一个副本被标记为“保留”，系统将强制锁定这一组的删除操作。**绝不允许软件删掉你在这个世界上的最后一份副本**。
- 🚀 **极速两级哈希扫描引擎**：专为 NAS 有限的 CPU 性能优化。采用 `xxHash64` (初筛) + `SHA-256` (确认) 两级哈希策略，仅在文件大小和初筛哈希完全一致时才进行高强度计算，扫描速度远超传统工具。
- 🐳 **原生 Docker 支持**：提供 `docker-compose` 一键部署方案，完美隔离环境，安全挂载 NAS 存储卷。
- 🖥️ **现代化的 UI 界面**：支持实时 WebSocket 进度推送，拥有直观的树状目录展示，告别传统软件简陋的面条式列表。

---

## 📸 界面预览

* **首页与扫描配置**
  ![首页与扫描配置](engineering/docs/images/screenshot_home.png)

* **扫描进度与树状标记界面**
  ![扫描进度与树状标记界面](engineering/docs/images/screenshot_marking.png)

* **智能分类与清理确认面板**
  ![智能分类与清理确认面板](engineering/docs/images/screenshot_category.png)

---

## 🚀 快速开始 (基于 Docker，推荐 NAS 用户)

这是在群晖 NAS 或任何支持 Docker 的 Linux 服务器上部署“麦克斯韦妖”的最快方式。

### 1. 获取代码与配置

克隆本仓库到你的服务器：

```bash
git clone https://github.com/offcv/maxwells-demon.git
cd maxwells-demon/engineering
```

### 2. 配置存储卷 (挂载你的 NAS)

打开 `docker-compose.yml` 文件，修改 `volumes` 部分，将 `/volume1` 替换为你实际想要扫描的 NAS 路径：

```yaml
services:
  backend:
    volumes:
      # 将宿主机的 /volume1 挂载到容器内的 /mnt/nas 供软件扫描
      - /volume1:/mnt/nas
      # 数据库与配置文件持久化
      - maxwells-demon-data:/app/data
```

### 3. 一键启动

在 `engineering` 目录下执行：

```bash
docker-compose up -d
```

启动完成后，打开浏览器访问 `http://你的服务器IP:3080` 即可开始使用！

*(注：macOS Sequoia 用户如果遇到浏览器被系统安全机制拦截的情况，请在系统设置中为浏览器开启“本地网络”权限。)*

---

## 💻 本地开发与原生运行

如果你希望在 macOS/Windows 上进行原生部署或参与二次开发，本项目采用了前后端分离（Vue/React + FastAPI）的架构。

> **⚠️ 兼容性提示：**
> 本软件设计底层兼容 Linux (Docker)、macOS 和 Windows。但目前**仅在群晖 NAS (Docker) 和 macOS (本地) 环境下进行了完整的手工测试**。为 NAS 专门优化了资源消耗，普通用户强烈推荐使用 Docker 部署，Windows 用户可自行部署体验，欢迎反馈问题！

---

## 🤝 参与贡献

欢迎提交 Issue 报告 Bug，或通过 Pull Request 提供新功能和优化建议。
运行测试用例请参考 `QA/engineering/tests/README.md`。

---

## 📄 开源协议

本项目基于 [GPL v3.0](LICENSE) 协议开源。
