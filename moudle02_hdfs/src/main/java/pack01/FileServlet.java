package pack01;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;
import org.apache.hadoop.conf.Configuration;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;

/**
 * Servlet for file operations: upload, download, delete files in HDFS
 */
@WebServlet("/api/file/*")
@MultipartConfig(
    fileSizeThreshold = 1024 * 1024 * 2,  // 2MB
    maxFileSize = 1024 * 1024 * 100,       // 100MB
    maxRequestSize = 1024 * 1024 * 100     // 100MB
)
public class FileServlet extends HttpServlet {
    private HdfsService hdfsService;
    private ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void init() throws ServletException {
        try {
            String hdfsUri = "hdfs://node1:8020";
            String user = "root";
            hdfsService = new HdfsService(hdfsUri, user, new Configuration());
        } catch (Exception e) {
            throw new ServletException("Failed to initialize HDFS service", e);
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String action = req.getParameter("action");
        
        if ("download".equals(action)) {
            handleDownload(req, resp);
        } else {
            sendError(resp, "Invalid action");
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String action = req.getParameter("action");
        
        if ("upload".equals(action)) {
            handleUpload(req, resp);
        } else {
            sendError(resp, "Invalid action");
        }
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        handleDelete(req, resp);
    }

    private void handleUpload(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String remotePath = req.getParameter("path");
        if (remotePath == null || remotePath.isEmpty()) {
            sendError(resp, "Path parameter is required");
            return;
        }

        Part filePart = req.getPart("file");
        if (filePart == null) {
            sendError(resp, "File is required");
            return;
        }

        try {
            // Save to temporary file first
            Path tempFile = Files.createTempFile("hdfs-upload-", ".tmp");
            try (InputStream inputStream = filePart.getInputStream()) {
                Files.copy(inputStream, tempFile, StandardCopyOption.REPLACE_EXISTING);
            }

            // Upload to HDFS
            String fileName = getFileName(filePart);
            String targetPath = remotePath.endsWith("/") ? remotePath + fileName : remotePath + "/" + fileName;
            hdfsService.upload(tempFile.toString(), targetPath);

            // Clean up temp file
            Files.delete(tempFile);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "File uploaded successfully");
            response.put("path", targetPath);
            sendJson(resp, response);

        } catch (Exception e) {
            sendError(resp, "Upload failed: " + e.getMessage());
        }
    }

    private void handleDownload(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String remotePath = req.getParameter("path");
        if (remotePath == null || remotePath.isEmpty()) {
            sendError(resp, "Path parameter is required");
            return;
        }

        try {
            // Create temporary file for download
            Path tempFile = Files.createTempFile("hdfs-download-", ".tmp");
            hdfsService.download(remotePath, tempFile.toString());

            // Set response headers
            String fileName = remotePath.substring(remotePath.lastIndexOf('/') + 1);
            resp.setContentType("application/octet-stream");
            resp.setHeader("Content-Disposition", "attachment; filename=\"" + fileName + "\"");
            resp.setContentLengthLong(Files.size(tempFile));

            // Stream file to response
            try (InputStream in = Files.newInputStream(tempFile);
                 OutputStream out = resp.getOutputStream()) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
            }

            // Clean up temp file
            Files.delete(tempFile);

        } catch (Exception e) {
            sendError(resp, "Download failed: " + e.getMessage());
        }
    }

    private void handleDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String remotePath = req.getParameter("path");
        if (remotePath == null || remotePath.isEmpty()) {
            sendError(resp, "Path parameter is required");
            return;
        }

        try {
            boolean recursive = Boolean.parseBoolean(req.getParameter("recursive"));
            boolean deleted = hdfsService.delete(remotePath, recursive);

            Map<String, Object> response = new HashMap<>();
            response.put("success", deleted);
            response.put("message", deleted ? "File deleted successfully" : "File not found");
            sendJson(resp, response);

        } catch (Exception e) {
            sendError(resp, "Delete failed: " + e.getMessage());
        }
    }

    private String getFileName(Part part) {
        String contentDisposition = part.getHeader("content-disposition");
        String[] tokens = contentDisposition.split(";");
        for (String token : tokens) {
            if (token.trim().startsWith("filename")) {
                return token.substring(token.indexOf('=') + 1).trim().replace("\"", "");
            }
        }
        return "unknown";
    }

    private void sendJson(HttpServletResponse resp, Object data) throws IOException {
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(resp.getWriter(), data);
    }

    private void sendError(HttpServletResponse resp, String message) throws IOException {
        resp.setStatus(HttpServletResponse.SC_BAD_REQUEST);
        Map<String, Object> error = new HashMap<>();
        error.put("success", false);
        error.put("message", message);
        sendJson(resp, error);
    }

    @Override
    public void destroy() {
        if (hdfsService != null) {
            try {
                hdfsService.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
}
