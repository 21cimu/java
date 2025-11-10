package pack01;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.hadoop.conf.Configuration;

import java.io.IOException;
import java.util.*;

/**
 * Servlet for directory operations: list, create, delete directories in HDFS
 */
@WebServlet("/api/directory/*")
public class DirectoryServlet extends HttpServlet {
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
        
        if ("list".equals(action)) {
            handleList(req, resp);
        } else if ("search".equals(action)) {
            handleSearch(req, resp);
        } else {
            sendError(resp, "Invalid action");
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String action = req.getParameter("action");
        
        if ("create".equals(action)) {
            handleCreate(req, resp);
        } else {
            sendError(resp, "Invalid action");
        }
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        handleDelete(req, resp);
    }

    private void handleList(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getParameter("path");
        if (path == null || path.isEmpty()) {
            path = "/";
        }

        try {
            List<String> entries = hdfsService.listDir(path);
            List<Map<String, Object>> items = new ArrayList<>();

            for (String entry : entries) {
                Map<String, Object> item = new HashMap<>();
                boolean isDir = entry.startsWith("DIR :");
                String fullPath = entry.substring(entry.indexOf(':') + 1).trim();
                String name = fullPath.substring(fullPath.lastIndexOf('/') + 1);

                item.put("name", name);
                item.put("path", fullPath);
                item.put("isDirectory", isDir);
                item.put("type", isDir ? "directory" : "file");
                items.add(item);
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("path", path);
            response.put("items", items);
            sendJson(resp, response);

        } catch (Exception e) {
            sendError(resp, "Failed to list directory: " + e.getMessage());
        }
    }

    private void handleCreate(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getParameter("path");
        if (path == null || path.isEmpty()) {
            sendError(resp, "Path parameter is required");
            return;
        }

        try {
            boolean created = hdfsService.mkdirs(path);

            Map<String, Object> response = new HashMap<>();
            response.put("success", created);
            response.put("message", created ? "Directory created successfully" : "Directory already exists");
            response.put("path", path);
            sendJson(resp, response);

        } catch (Exception e) {
            sendError(resp, "Failed to create directory: " + e.getMessage());
        }
    }

    private void handleDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getParameter("path");
        if (path == null || path.isEmpty()) {
            sendError(resp, "Path parameter is required");
            return;
        }

        try {
            boolean recursive = Boolean.parseBoolean(req.getParameter("recursive"));
            boolean deleted = hdfsService.delete(path, recursive);

            Map<String, Object> response = new HashMap<>();
            response.put("success", deleted);
            response.put("message", deleted ? "Directory deleted successfully" : "Directory not found");
            sendJson(resp, response);

        } catch (Exception e) {
            sendError(resp, "Failed to delete directory: " + e.getMessage());
        }
    }

    private void handleSearch(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String startDir = req.getParameter("startDir");
        String nameContains = req.getParameter("name");
        
        if (startDir == null || startDir.isEmpty()) {
            startDir = "/";
        }
        if (nameContains == null || nameContains.isEmpty()) {
            sendError(resp, "Name parameter is required for search");
            return;
        }

        try {
            List<String> results = hdfsService.search(startDir, nameContains);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("results", results);
            response.put("count", results.size());
            sendJson(resp, response);

        } catch (Exception e) {
            sendError(resp, "Search failed: " + e.getMessage());
        }
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
