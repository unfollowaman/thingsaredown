const express = require('express');
const cors = require('cors');
const { execFile, spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5173;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use(express.static(__dirname));

// Endpoint to fetch video metadata safely
app.get('/api/info', (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  // Use execFile with array of arguments to prevent command injection
  const args = ['--dump-json', '--no-warnings', '--no-playlist', url];

  execFile('yt-dlp', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error('yt-dlp info error:', stderr || error.message);
      return res.status(500).json({ error: 'Failed to extract video details. Ensure the URL is valid.' });
    }

    try {
      const data = JSON.parse(stdout);

      // Extract available formats/heights
      const formats = data.formats || [];
      const heights = new Set();

      formats.forEach(f => {
        if (f.height && (f.vcodec !== 'none' || f.acodec !== 'none')) {
          heights.add(f.height);
        }
      });

      const sortedHeights = Array.from(heights).sort((a, b) => b - a);
      const qualities = sortedHeights.map(h => `${h}p`);

      // Default qualities fallback if none found
      const availableQualities = qualities.length > 0 ? qualities : ['1080p', '720p', '480p', '360p'];

      const durationSec = data.duration || 0;
      const mins = Math.floor(durationSec / 60);
      const secs = String(durationSec % 60).padStart(2, '0');
      const formattedDuration = `${mins}:${secs}`;

      // Calculate approximate filesize if available
      const filesize = data.filesize || data.filesize_approx;
      const formattedSize = filesize ? `${(filesize / (1024 * 1024)).toFixed(1)} MB` : 'Variable size';

      res.json({
        title: data.title || 'YouTube Video',
        duration: formattedDuration,
        thumbnail: data.thumbnail || '',
        uploader: data.uploader || 'YouTube Channel',
        filesize: formattedSize,
        qualities: availableQualities,
        ext: data.ext || 'mp4'
      });
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      res.status(500).json({ error: 'Failed to parse video info.' });
    }
  });
});

// Endpoint to download video or audio stream
app.get('/api/download', (req, res) => {
  const { url, quality } = req.query;

  if (!url) {
    return res.status(400).send('Missing URL parameter');
  }

  let formatArg = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
  let isAudioOnly = false;

  if (quality === 'Audio' || quality === 'audio') {
    isAudioOnly = true;
    formatArg = 'bestaudio/best';
  } else if (quality) {
    const height = parseInt(quality.replace('p', ''), 10);
    if (!isNaN(height)) {
      formatArg = `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best[height<=${height}]/best`;
    }
  }

  // Get filename using execFile safely
  execFile('yt-dlp', ['--get-filename', '-o', '%(title)s.%(ext)s', '--no-warnings', '--no-playlist', url], (err, stdout) => {
    let filename = stdout ? stdout.trim() : 'video.mp4';
    if (isAudioOnly) {
      filename = filename.replace(/\.[^/.]+$/, "") + ".mp3";
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', isAudioOnly ? 'audio/mpeg' : 'video/mp4');

    const downloadArgs = [
      '-o', '-',
      '--no-playlist',
      '--no-warnings',
      '-f', formatArg,
      url
    ];

    const ytdlpProcess = spawn('yt-dlp', downloadArgs);

    ytdlpProcess.stdout.pipe(res);

    ytdlpProcess.stderr.on('data', (data) => {
      console.error(`yt-dlp download stderr: ${data}`);
    });

    ytdlpProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`yt-dlp download process exited with code ${code}`);
      }
    });

    req.on('close', () => {
      ytdlpProcess.kill();
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
