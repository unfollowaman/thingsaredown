import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT || '5173', 10);
const server = createApp();

server.listen(port, () => {
  console.log(`Things Are Down running at http://localhost:${port}`);
});
