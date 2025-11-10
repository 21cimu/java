# 部署指南 (Deployment Guide)

## 环境准备

### 1. HDFS 集群配置

确保您的 Hadoop HDFS 集群正常运行。本项目默认配置为：
- **HDFS URI**: hdfs://node1:8020
- **用户名**: root

如果您的配置不同，需要修改：

#### 修改 Servlet 配置
编辑以下文件中的 HDFS 连接信息：

**FileServlet.java** (第 36-37 行):
```java
String hdfsUri = "hdfs://node1:8020";  // 修改为您的 HDFS URI
String user = "root";                   // 修改为您的用户名
```

**DirectoryServlet.java** (第 24-25 行):
```java
String hdfsUri = "hdfs://node1:8020";  // 修改为您的 HDFS URI
String user = "root";                   // 修改为您的用户名
```

#### 修改 Hadoop 配置文件
编辑 `src/main/resources/core-site.xml`:
```xml
<property>
    <name>fs.defaultFS</name>
    <value>hdfs://node1:8020</value>  <!-- 修改为您的 HDFS URI -->
</property>
```

### 2. 验证 HDFS 连接

在部署前，先测试 HDFS 连接：

```bash
# 使用项目提供的测试类
cd moudle02_hdfs
mvn test -Dtest=Demo01HDFS#getFileSystem
```

或者使用命令行工具测试：

```bash
hdfs dfs -ls /
```

### 3. 配置防火墙

确保以下端口可访问：
- **HDFS**: 8020 (NameNode RPC)
- **HDFS Web UI**: 9870 (可选)
- **Tomcat**: 8080 (默认)

## 编译打包

### 1. 编译项目

```bash
cd moudle02_hdfs
mvn clean compile
```

### 2. 打包 WAR 文件

```bash
mvn package
```

成功后会生成：
```
target/moudle02_hdfs-1.0-SNAPSHOT.war
```

### 3. 验证 WAR 包

```bash
# 列出 WAR 包内容
unzip -l target/moudle02_hdfs-1.0-SNAPSHOT.war

# 应该包含：
# - index.html
# - css/style.css
# - js/app.js
# - WEB-INF/web.xml
# - WEB-INF/classes/pack01/*.class
# - WEB-INF/lib/*.jar
```

## Tomcat 部署

### 1. 安装 Tomcat

如果尚未安装 Tomcat 10+:

```bash
# 下载 Tomcat 10
wget https://dlcdn.apache.org/tomcat/tomcat-10/v10.1.33/bin/apache-tomcat-10.1.33.tar.gz

# 解压
tar -xzf apache-tomcat-10.1.33.tar.gz
mv apache-tomcat-10.1.33 /opt/tomcat

# 设置环境变量
export CATALINA_HOME=/opt/tomcat
```

### 2. 部署 WAR 包

```bash
# 复制 WAR 文件到 Tomcat webapps 目录
cp target/moudle02_hdfs-1.0-SNAPSHOT.war $CATALINA_HOME/webapps/cloud-drive.war

# Tomcat 会自动解压部署
```

### 3. 配置 Tomcat (可选)

#### 增加内存配置
编辑 `$CATALINA_HOME/bin/setenv.sh`:
```bash
export JAVA_OPTS="-Xms512m -Xmx2048m -XX:MaxPermSize=256m"
```

#### 配置上传文件大小限制
编辑 `$CATALINA_HOME/conf/server.xml`，在 Connector 中添加：
```xml
<Connector port="8080" protocol="HTTP/1.1"
           connectionTimeout="20000"
           redirectPort="8443"
           maxPostSize="104857600" />  <!-- 100MB -->
```

### 4. 启动 Tomcat

```bash
# 启动
$CATALINA_HOME/bin/startup.sh

# 查看日志
tail -f $CATALINA_HOME/logs/catalina.out
```

### 5. 验证部署

访问以下 URL 验证部署：
```
http://localhost:8080/cloud-drive/
```

应该看到云盘界面。

检查日志：
```bash
tail -f $CATALINA_HOME/logs/cloud-drive.log
```

## 测试 API

### 使用 curl 测试

#### 1. 列出根目录
```bash
curl "http://localhost:8080/cloud-drive/api/directory?action=list&path=/"
```

#### 2. 创建目录
```bash
curl -X POST "http://localhost:8080/cloud-drive/api/directory?action=create&path=/test"
```

#### 3. 上传文件
```bash
curl -X POST -F "file=@/path/to/local/file.txt" \
  "http://localhost:8080/cloud-drive/api/file?action=upload&path=/test"
```

#### 4. 下载文件
```bash
curl "http://localhost:8080/cloud-drive/api/file?action=download&path=/test/file.txt" -o downloaded.txt
```

#### 5. 搜索文件
```bash
curl "http://localhost:8080/cloud-drive/api/directory?action=search&startDir=/&name=file"
```

#### 6. 删除文件
```bash
curl -X DELETE "http://localhost:8080/cloud-drive/api/file?action=delete&path=/test/file.txt"
```

## 常见问题

### 1. HDFS 连接失败

**错误**: `java.net.ConnectException: Connection refused`

**解决方案**:
- 检查 HDFS 是否运行：`jps` 应该看到 NameNode 和 DataNode
- 检查防火墙设置
- 验证 core-site.xml 中的 fs.defaultFS 配置
- 确认网络可达：`telnet node1 8020`

### 2. 权限错误

**错误**: `org.apache.hadoop.security.AccessControlException: Permission denied`

**解决方案**:
- 修改 HDFS 目录权限：`hdfs dfs -chmod -R 777 /`
- 或者在 Servlet 中使用正确的用户名

### 3. 文件上传失败

**错误**: 上传超时或文件过大

**解决方案**:
- 增加 Tomcat 的 maxPostSize
- 增加 FileServlet 中的 maxFileSize
- 检查 HDFS 磁盘空间

### 4. 内存不足

**错误**: `java.lang.OutOfMemoryError`

**解决方案**:
- 增加 Tomcat JVM 内存
- 优化大文件处理方式

### 5. 端口冲突

**错误**: `Address already in use`

**解决方案**:
- 修改 Tomcat 端口：编辑 `server.xml` 中的 Connector port
- 或者停止占用端口的进程

## 生产环境优化

### 1. 启用 HTTPS

编辑 `$CATALINA_HOME/conf/server.xml`:
```xml
<Connector port="8443" protocol="org.apache.coyote.http11.Http11NioProtocol"
           maxThreads="150" SSLEnabled="true">
    <SSLHostConfig>
        <Certificate certificateKeystoreFile="conf/keystore.jks"
                     type="RSA" />
    </SSLHostConfig>
</Connector>
```

### 2. 配置负载均衡

使用 Nginx 作为反向代理：

```nginx
upstream tomcat_cluster {
    server localhost:8080;
    server localhost:8081;
}

server {
    listen 80;
    server_name cloud-drive.example.com;
    
    location / {
        proxy_pass http://tomcat_cluster;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. 启用日志

在 `src/main/resources/log4j.properties` 中配置详细日志。

### 4. 监控和告警

- 使用 JMX 监控 Tomcat
- 配置 HDFS 监控
- 设置磁盘空间告警

## 停止和卸载

### 停止应用
```bash
$CATALINA_HOME/bin/shutdown.sh
```

### 卸载应用
```bash
rm -rf $CATALINA_HOME/webapps/cloud-drive*
```

### 清理 HDFS 数据
```bash
hdfs dfs -rm -r /path/to/your/data
```

## 自动化部署脚本

创建部署脚本 `deploy.sh`:

```bash
#!/bin/bash

# 配置
TOMCAT_HOME=/opt/tomcat
APP_NAME=cloud-drive
WAR_FILE=target/moudle02_hdfs-1.0-SNAPSHOT.war

# 停止 Tomcat
echo "停止 Tomcat..."
$TOMCAT_HOME/bin/shutdown.sh
sleep 5

# 删除旧版本
echo "删除旧版本..."
rm -rf $TOMCAT_HOME/webapps/$APP_NAME*

# 编译打包
echo "编译打包..."
cd moudle02_hdfs
mvn clean package -DskipTests

# 部署新版本
echo "部署新版本..."
cp $WAR_FILE $TOMCAT_HOME/webapps/$APP_NAME.war

# 启动 Tomcat
echo "启动 Tomcat..."
$TOMCAT_HOME/bin/startup.sh

# 等待部署完成
echo "等待部署完成..."
sleep 10

# 检查部署状态
echo "检查部署状态..."
curl -s http://localhost:8080/$APP_NAME/ > /dev/null
if [ $? -eq 0 ]; then
    echo "部署成功！"
    echo "访问地址: http://localhost:8080/$APP_NAME/"
else
    echo "部署失败，请检查日志"
    tail -n 50 $TOMCAT_HOME/logs/catalina.out
fi
```

使用方法：
```bash
chmod +x deploy.sh
./deploy.sh
```

## 备份和恢复

### 备份 HDFS 数据
```bash
hdfs dfs -get / /backup/hdfs-backup-$(date +%Y%m%d)
```

### 恢复 HDFS 数据
```bash
hdfs dfs -put /backup/hdfs-backup-20251110/* /
```

---

**注意**: 确保在生产环境中实施适当的安全措施，包括但不限于用户认证、授权、数据加密和访问控制。
