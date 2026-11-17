# 明文源码审计入口

仓库源文件本身就是明文。若工具将仓库下载为 ZIP，但不能解压，删除重传仓库不能解决读取问题。请直接打开下面的 Raw 链接，或下载 TXT 文件后作为文本附件上传；不要使用 GitHub 的 Download ZIP。

## 完整源码

[直接读取完整前端源码 TXT](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/FRONTEND_SOURCE.txt)

这是未压缩的 UTF-8 文本，包含实际源代码，不是目录索引。约 4 MB。如果工具提示内容过长，请使用下面的分段文件。

## 分段源码

每段不超过约 180 KB，保留原始文件路径和行号范围；按顺序读取即可覆盖全部提取源码。

- [part-01.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-01.txt)（176,929 字节）
- [part-02.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-02.txt)（166,059 字节）
- [part-03.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-03.txt)（171,756 字节）
- [part-04.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-04.txt)（151,510 字节）
- [part-05.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-05.txt)（69,131 字节）
- [part-06.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-06.txt)（170,092 字节）
- [part-07.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-07.txt)（174,473 字节）
- [part-08.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-08.txt)（177,827 字节）
- [part-09.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-09.txt)（170,545 字节）
- [part-10.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-10.txt)（178,535 字节）
- [part-11.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-11.txt)（124,552 字节）
- [part-12.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-12.txt)（173,665 字节）
- [part-13.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-13.txt)（176,634 字节）
- [part-14.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-14.txt)（175,708 字节）
- [part-15.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-15.txt)（174,944 字节）
- [part-16.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-16.txt)（170,482 字节）
- [part-17.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-17.txt)（166,756 字节）
- [part-18.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-18.txt)（168,623 字节）
- [part-19.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-19.txt)（170,194 字节）
- [part-20.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-20.txt)（171,817 字节）
- [part-21.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-21.txt)（172,114 字节）
- [part-22.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-22.txt)（144,652 字节）
- [part-23.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-23.txt)（178,757 字节）
- [part-24.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-24.txt)（175,197 字节）
- [part-25.txt](https://raw.githubusercontent.com/chendlwwbq/sundas-frontend-audit/main/audit-plaintext/part-25.txt)（75,982 字节）

## 复制给审计工具

> 以下链接是未压缩 UTF-8 源代码文本。不要下载整个仓库的 ZIP。请直接读取 FRONTEND_SOURCE.txt；若受上下文限制，则按顺序读取 audit-plaintext/part-XX.txt，每段开头和章节标题标有实际文件路径与行号。请审查这些实际源码与界面，不要仅基于目录名推断功能。审计范围及报告格式见 AUDIT_GUIDE.md。

## 覆盖边界

包含页面、组件、主题、CSS 动画、画布/导演台交互、前端类型、状态与适配代码；不含 node_modules、锁文件、构建产物、图片/视频二进制、后端和环境文件。可运行的原始前端文件仍保留在同一仓库，供浏览器预览和按文件定位。
