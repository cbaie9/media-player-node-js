const express = require('express');
const path = require('path');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
const multer = require('multer');
const { USERNAME, PASSWORD } = require('./auth.config.js');

const app = express();
const PORT = 3000;
const MEDIA_ROOT = path.join(__dirname, 'Appluncher');

// Configuration Multer pour l'upload
const upload = multer({
  dest: 'uploads/tmp/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg','.jpeg','.png','.gif','.webp','.mp4','.webm','.mov','.avi','.mkv'];
    cb(null, allowed.includes(ext));
  }
});

// Middleware
app.use(basicAuth({
  users: { [USERNAME]: PASSWORD },
  challenge: true,
  realm: 'Media Viewer'
}));
app.use(express.static(__dirname));
app.use(express.json());

// Route d'upload
app.post('/api/upload', upload.array('mediaFiles'), (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files received' });

    const targetDir = path.join(MEDIA_ROOT, req.body.path || '');
    if (!targetDir.startsWith(MEDIA_ROOT)) {
      return res.status(403).json({ error: 'Forbidden path' });
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const results = [];
    req.files.forEach(file => {
      const finalPath = path.join(targetDir, file.originalname);
      fs.renameSync(file.path, finalPath);
      results.push({
        name: file.originalname,
        path: finalPath.replace(MEDIA_ROOT, '')
      });
    });

    res.json({ success: true, uploaded: results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// API pour l'explorateur
app.get('/api/list', (req, res) => {
  const relPath = req.query.path || '/';
  const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const targetDir = path.join(MEDIA_ROOT, safePath);

  if (!targetDir.startsWith(MEDIA_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  fs.readdir(targetDir, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json({ error: 'Read error' });

    const files = entries
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: entry.isDirectory() 
          ? `${relPath}${entry.name}/`
          : `/media?path=${encodeURIComponent(path.join(safePath, entry.name))}`
      }));

    res.json(files);
  });
});

// Route pour les médias
app.get('/media', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).send('Missing path');

  const absolutePath = path.join(MEDIA_ROOT, filePath);
  if (!absolutePath.startsWith(MEDIA_ROOT)) {
    return res.status(403).send('Forbidden');
  }

  fs.stat(absolutePath, (err, stats) => {
    if (err) return res.status(404).send('Not found');

    const fileSize = stats.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      const file = fs.createReadStream(absolutePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': (end - start) + 1,
        'Content-Type': 'video/mp4'
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      });
      fs.createReadStream(absolutePath).pipe(res);
    }
  });
});

// API pour supprimer un fichier
app.delete('/api/delete', (req, res) => {
  const filePath = req.body?.path;
  if (!filePath) return res.status(400).json({ error: 'Missing file path' });

  const absolutePath = path.join(MEDIA_ROOT, filePath);
  if (!absolutePath.startsWith(MEDIA_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  fs.stat(absolutePath, (err, stats) => {
    if (err || !stats) return res.status(404).json({ error: 'File not found' });

    const deleteAction = stats.isDirectory() ? fs.rm : fs.unlink;

    deleteAction(absolutePath, { recursive: true, force: true }, (err) => {
      if (err) return res.status(500).json({ error: 'Deletion failed' });
      res.json({ success: true });
    });
  });
});


// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Media root: ${MEDIA_ROOT}`);
});