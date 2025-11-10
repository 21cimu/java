# 个人云盘项目 - Personal Cloud Drive

基于 Hadoop HDFS 的前后端分离个人云盘系统

A front-end and back-end separated personal cloud storage project based on Hadoop HDFS.

## 项目概述 (Project Overview)

本项目实现了一个类似百度网盘的个人云存储系统，使用 Hadoop HDFS 作为底层存储，Tomcat 作为 Web 服务器部署后端 API，前端采用现代化的 HTML/CSS/JavaScript 技术栈。

This project implements a personal cloud storage system similar to Baidu Netdisk, using Hadoop HDFS as the underlying storage, Tomcat as the web server for backend API deployment, and a modern HTML/CSS/JavaScript stack for the frontend.

## 技术架构 (Technical Architecture)

### 后端 (Backend)
- **Java Servlets**: RESTful API 实现
- **Hadoop HDFS 3.3.0**: 分布式文件存储
- **Jakarta Servlet API 6.1.0**: Servlet 规范实现
- **Jackson 2.18.0**: JSON 序列化/反序列化
- **Maven**: 项目构建和依赖管理

### 前端 (Frontend)
- **HTML5**: 页面结构
- **CSS3**: 现代化样式设计（渐变、响应式布局）
- **Vanilla JavaScript**: 无框架的纯 JavaScript 实现
- **Fetch API**: 异步 HTTP 请求

### 部署 (Deployment)
- **Tomcat**: WAR 包部署
- **HDFS**: 运行在虚拟机上 (hdfs://node1:8020)

## 功能特性 (Features)

- ✅ **文件上传** - 支持单文件和多文件上传
- ✅ **文件下载** - 一键下载文件到本地
- ✅ **创建文件夹** - 在任意目录创建新文件夹
- ✅ **删除操作** - 删除文件或文件夹（支持递归删除）
- ✅ **目录浏览** - 面包屑导航，轻松浏览目录结构
- ✅ **搜索功能** - 按文件名搜索文件
- ✅ **批量操作** - 选择多个项目进行批量删除
- ✅ **响应式设计** - 支持桌面和移动设备
- ✅ **加载指示器** - 友好的用户体验反馈

## 项目结构 (Project Structure)

```
moudle02_hdfs/
├── pom.xml                          # Maven 配置文件
├── src/
│   ├── main/
│   │   ├── java/pack01/
│   │   │   ├── FileServlet.java     # 文件操作 API
│   │   │   ├── DirectoryServlet.java # 目录操作 API
│   │   │   ├── HdfsService.java     # HDFS 服务封装
│   │   │   ├── HdfsDriveApp.java    # 命令行工具
│   │   │   └── Demo01HDFS.java      # HDFS 示例代码
│   │   ├── resources/
│   │   │   ├── core-site.xml        # Hadoop 核心配置
│   │   │   ├── hdfs-site.xml        # HDFS 配置
│   │   │   ├── mapred-site.xml      # MapReduce 配置
│   │   │   ├── yarn-site.xml        # YARN 配置
│   │   │   └── log4j.properties     # 日志配置
│   │   └── webapp/
│   │       ├── index.html           # 主页面
│   │       ├── css/
│   │       │   └── style.css        # 样式文件
│   │       ├── js/
│   │       │   └── app.js           # 应用逻辑
│   │       └── WEB-INF/
│   │           └── web.xml          # Web 应用配置
```

## API 接口 (API Endpoints)

### 文件操作 (File Operations)

#### 上传文件
```
POST /api/file?action=upload&path={targetPath}
Content-Type: multipart/form-data
Body: file={fileData}
```

#### 下载文件
```
GET /api/file?action=download&path={filePath}
```

#### 删除文件
```
DELETE /api/file?action=delete&path={filePath}&recursive={true|false}
```

### 目录操作 (Directory Operations)

#### 列出目录内容
```
GET /api/directory?action=list&path={directoryPath}
```

#### 创建目录
```
POST /api/directory?action=create&path={newDirectoryPath}
```

#### 删除目录
```
DELETE /api/directory?action=delete&path={directoryPath}&recursive={true|false}
```

#### 搜索文件
```
GET /api/directory?action=search&startDir={startPath}&name={searchTerm}
```

## 安装部署 (Installation & Deployment)

### 前置条件 (Prerequisites)

1. **Java 8+** 已安装
2. **Maven 3.6+** 已安装
3. **Apache Tomcat 10+** 已安装
4. **Hadoop HDFS** 集群已配置并运行在 `node1:8020`

### 构建项目 (Build)

```bash
cd moudle02_hdfs
mvn clean package
```

构建成功后，会在 `target/` 目录下生成 `moudle02_hdfs-1.0-SNAPSHOT.war` 文件。

### 部署到 Tomcat (Deploy to Tomcat)

1. 将生成的 WAR 文件复制到 Tomcat 的 `webapps` 目录：
```bash
cp target/moudle02_hdfs-1.0-SNAPSHOT.war $TOMCAT_HOME/webapps/cloud-drive.war
```

2. 启动 Tomcat：
```bash
$TOMCAT_HOME/bin/startup.sh
```

3. 访问应用：
```
http://localhost:8080/cloud-drive/
```

### 配置 HDFS 连接 (Configure HDFS Connection)

如果您的 HDFS 不在 `hdfs://node1:8020`，需要修改以下文件：

1. `src/main/java/pack01/FileServlet.java` - 修改第 36 行的 `hdfsUri`
2. `src/main/java/pack01/DirectoryServlet.java` - 修改第 24 行的 `hdfsUri`
3. `src/main/resources/core-site.xml` - 修改 `fs.defaultFS` 配置

## 使用说明 (Usage)

### 基本操作

1. **上传文件**：点击"上传文件"按钮，选择要上传的文件
2. **浏览目录**：点击文件夹名称进入该目录
3. **下载文件**：点击文件行的"下载"按钮
4. **创建文件夹**：点击"新建文件夹"按钮，输入文件夹名称
5. **删除**：选中文件/文件夹，点击"删除"按钮
6. **搜索**：在搜索框输入关键词，点击"搜索"按钮

### 命令行工具 (CLI Tool)

项目还提供了命令行工具用于直接操作 HDFS：

```bash
java -cp target/classes:$HADOOP_HOME/share/hadoop/common/*:$HADOOP_HOME/share/hadoop/hdfs/* \
  pack01.HdfsDriveApp <command> [args...]

# 示例命令:
# 上传文件
java pack01.HdfsDriveApp upload /local/file.txt /hdfs/path/

# 下载文件
java pack01.HdfsDriveApp download /hdfs/path/file.txt /local/path/

# 创建目录
java pack01.HdfsDriveApp mkdir /hdfs/path/newdir

# 列出目录
java pack01.HdfsDriveApp list /hdfs/path/

# 搜索文件
java pack01.HdfsDriveApp search /hdfs/path/ filename

# 删除文件
java pack01.HdfsDriveApp delete /hdfs/path/file.txt false
```

## 开发指南 (Development Guide)

### 编译项目
```bash
mvn clean compile
```

### 运行测试
```bash
mvn test
```

### 打包项目
```bash
mvn package
```

### 清理构建
```bash
mvn clean
```

## 安全性 (Security)

- ✅ 代码通过 CodeQL 安全扫描，无已知漏洞
- ✅ 使用 Jakarta Servlet API 6.1.0，包含最新安全更新
- ✅ 文件上传大小限制：单个文件最大 100MB
- ⚠️ 建议在生产环境中添加用户认证和授权机制
- ⚠️ 建议配置 HTTPS 以保护数据传输

## 性能优化建议 (Performance Optimization)

1. **启用 HDFS 缓存** - 提高读取性能
2. **使用 CDN** - 加速静态资源加载
3. **启用 Gzip 压缩** - 减少传输数据量
4. **配置连接池** - 复用 HDFS 连接
5. **实现分片上传** - 支持大文件上传

## 已知问题 (Known Issues)

- 大文件上传可能需要较长时间，建议实现进度条
- 搜索功能在大规模数据集上可能较慢，建议添加索引
- 当前版本不支持文件预览功能

## 未来计划 (Future Plans)

- [ ] 用户认证和权限管理
- [ ] 文件分享功能
- [ ] 文件版本控制
- [ ] 在线预览（图片、PDF、文本）
- [ ] 断点续传
- [ ] 回收站功能
- [ ] WebSocket 实时通知
- [ ] Docker 容器化部署

## 贡献 (Contributing)

欢迎提交 Issue 和 Pull Request！

## 许可证 (License)

本项目使用的依赖库遵循其各自的许可证。

## 联系方式 (Contact)

如有问题或建议，请创建 Issue 或联系项目维护者。

---

**注意**: 本项目仅供学习和研究使用，请勿用于生产环境而不进行适当的安全加固。
